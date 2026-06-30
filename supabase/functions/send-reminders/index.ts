// send-reminders — paced reminder emails for forms that still need student action.
//
// Runs on a daily cron (see supabase/cron-setup.sql). Cadence per assignment:
//   - deadline more than 7 days away  → remind weekly (>= 7 days since last reminder)
//   - deadline within 7 days, or overdue → remind daily (>= 1 day since last reminder)
// "Needs action" = no submission, or status 'draft' / 'rejected'. The first
// reminder fires on the first run after creation (last_reminded_at IS NULL),
// giving a weekly drip from creation that accelerates to daily near the deadline
// and keeps nagging daily until an overdue form is submitted/approved.
//
// Each run groups every due form per student into one email, sends it, then
// stamps last_reminded_at on those assignments so the next run respects the cadence.
//
// Deno runtime. Uses the service-role key (bypasses RLS) and the Resend REST API.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Prefer an explicitly-set secret key (SERVICE_KEY = an sb_secret_… key) so this
// keeps working after the legacy service_role key is deactivated. Falls back to
// the auto-injected legacy key during the migration window.
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'EazyExchange <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000'
// Shared secret the daily pg_cron job must present. Gating on this is independent
// of the platform JWT check: the anon key is public, so verify_jwt alone would
// let anyone trigger a reminder blast. Fail closed if it isn't configured.
const CRON_SECRET = Deno.env.get('CRON_SECRET')

const FINAL_WEEK_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

type ReminderForm = { name: string; deadline: string; overdue: boolean }

// Whole days from now until an ISO date (UTC). Negative when the date is past.
function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00Z`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

// Whether a reminder is due given the deadline distance and when we last reminded.
function isDue(daysLeft: number, lastRemindedAt: string | null): boolean {
  // Within the final week or overdue → daily; otherwise → weekly.
  const minIntervalDays = daysLeft <= FINAL_WEEK_DAYS ? 1 : 7
  if (!lastRemindedAt) return true
  const elapsedDays = (Date.now() - new Date(lastRemindedAt).getTime()) / DAY_MS
  // Tolerance: the cron fires at a fixed 08:00 but last_reminded_at is stamped a
  // few seconds later, so consecutive runs are elapsed-wise just under 24h apart.
  // Without the 0.5-day slack a `>= 1` daily gate would skip every other day.
  return elapsedDays >= minIntervalDays - 0.5
}

// Escape untrusted values before embedding them in email HTML.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmail(studentName: string, forms: ReminderForm[]): string {
  const greeting = studentName ? `Hi ${esc(studentName)},` : 'Hi,'
  const items = forms
    .map(f => {
      const due = new Date(f.deadline).toLocaleDateString()
      const label = f.overdue
        ? `<span style="color: #b91c1c;">overdue — was due ${due}</span>`
        : `due ${due}`
      return `<li style="margin-bottom: 6px;"><strong>${esc(f.name)}</strong> — ${label}</li>`
    })
    .join('')
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="font-weight: 600;">EazyExchange</h2>
      <p>${greeting}</p>
      <p>You have ${forms.length} form${forms.length === 1 ? '' : 's'} to complete:</p>
      <ul style="padding-left: 18px;">${items}</ul>
      <p><a href="${APP_URL}/my-forms" style="display: inline-block; background: #0f172a; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Complete your forms</a></p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">You're receiving this because you have forms to complete for a student exchange.</p>
    </div>
  `
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[send-reminders] RESEND_API_KEY not set — skipping reminder email')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    })
    if (!res.ok) {
      // Don't log `to` — it's student PII. Status + Resend's message is enough to debug.
      console.error('[send-reminders] Resend send failed:', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    // A network/DNS error must not abort the per-student loop — return false so
    // the rest of the cohort still gets reminded. No `to` in the log (PII).
    console.error('[send-reminders] Resend request error:', (err as Error).message)
    return false
  }
}

Deno.serve(async (req) => {
  // Only the scheduled cron job (which presents the shared secret) may run this.
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Pull every assignment with its form deadline, reminder state, and latest
  // submission status. Cadence and "needs action" are filtered in code.
  const { data: rows, error } = await supabase
    .from('assignments')
    .select(
      'id, last_reminded_at, student:users!student_id(email, full_name), form_templates!inner(name, deadline), submissions(status)',
    )

  if (error) {
    console.error('[send-reminders] query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // Group due forms per student email, tracking which assignment ids to stamp.
  const perStudent = new Map<
    string,
    { name: string; forms: ReminderForm[]; assignmentIds: string[] }
  >()

  for (const row of (rows ?? []) as any[]) {
    // submissions is one-to-one with assignments, so PostgREST returns it as an
    // object (not an array). Handle both shapes defensively.
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status: string | undefined = submission?.status
    if (status === 'approved' || status === 'submitted') continue

    const deadline: string | undefined = row.form_templates?.deadline
    if (!deadline) continue

    const daysLeft = daysUntil(deadline)
    if (!isDue(daysLeft, row.last_reminded_at)) continue

    const student = row.student
    if (!student?.email) continue

    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        forms: [],
        assignmentIds: [],
      })
    }
    const bucket = perStudent.get(student.email)!
    bucket.forms.push({ name: row.form_templates.name, deadline, overdue: daysLeft < 0 })
    bucket.assignmentIds.push(row.id)
  }

  const nowIso = new Date().toISOString()
  let sent = 0
  for (const [email, { name, forms, assignmentIds }] of perStudent) {
    const anyOverdue = forms.some(f => f.overdue)
    const subject = anyOverdue
      ? `Action needed: ${forms.length} form${forms.length === 1 ? '' : 's'} for your exchange`
      : `You have ${forms.length} form${forms.length === 1 ? '' : 's'} to complete`

    const ok = await sendEmail(email, subject, buildEmail(name, forms))
    if (!ok) continue
    sent++

    // Stamp only after a successful send so a failed email retries next run.
    const { error: stampError } = await supabase
      .from('assignments')
      .update({ last_reminded_at: nowIso })
      .in('id', assignmentIds)
    if (stampError) {
      console.error('[send-reminders] failed to stamp last_reminded_at:', stampError)
    }
  }

  return new Response(
    JSON.stringify({ students: perStudent.size, emailsSent: sent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
