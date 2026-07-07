// send-reminders — paced reminder emails for forms that still need student action.
//
// Runs on a daily cron (see supabase/cron-setup.sql). Pacing is per exchange:
// organizers pick a cadence preset ('douce' | 'normale' | 'insistante') or turn
// automatic reminders off entirely (exchanges.reminders_enabled = false). The
// interval math lives in ./pacing.ts (pure, unit-tested under vitest).
// "Needs action" = no submission, or status 'draft' / 'rejected'. The first
// reminder fires on the first run after creation (last_reminded_at IS NULL).
//
// Each run groups every due form per student into one French email, sends it,
// then stamps last_reminded_at on those assignments so the next run respects
// the cadence.
//
// Deno runtime. Uses the service-role key (bypasses RLS) and the Resend REST API.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolvePreset, isDue } from './pacing.ts'

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

const DAY_MS = 24 * 60 * 60 * 1000

type ReminderForm = { name: string; deadline: string; overdue: boolean }

// Whole days from now until an ISO date (UTC). Negative when the date is past.
function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00Z`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
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

// French short date («10 oct.»), matching the tone of lib/email.ts (which uses
// frShortDate — not importable here: Deno can't resolve the @/ alias).
const frDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
function frShortDate(isoDate: string): string {
  return frDateFormat.format(new Date(`${isoDate}T00:00:00Z`))
}

// « ton dossier pour X » when everything due this morning belongs to one
// exchange (the normal case); generic wording for the rare multi-exchange email.
function dossierRef(exchangeNames: string[], html: boolean): string {
  if (exchangeNames.length === 1) {
    const name = exchangeNames[0]
    return html ? `ton dossier pour <strong>${esc(name)}</strong>` : `ton dossier pour ${name}`
  }
  return 'ton dossier d’échange'
}

function buildEmail(studentName: string, exchangeNames: string[], forms: ReminderForm[]): string {
  const greeting = studentName ? `Bonjour ${esc(studentName)},` : 'Bonjour,'
  const items = forms
    .map(f => {
      const due = esc(frShortDate(f.deadline))
      const label = f.overdue
        ? `<span style="color: #b91c1c;">en retard — échéance ${due}</span>`
        : `échéance ${due}`
      return `<li style="margin-bottom: 6px;"><strong>${esc(f.name)}</strong> — ${label}</li>`
    })
    .join('')
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1F3A30;">
      <h2 style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px;"><span style="color: #3FA277;">Eazy</span>Exchange</h2>
      <p>${greeting}</p>
      <p>Il manque encore ${forms.length === 1 ? 'cet élément' : 'ces éléments'} à ${dossierRef(exchangeNames, true)} :</p>
      <ul style="padding-left: 18px;">${items}</ul>
      <p><a href="${APP_URL}/my-forms" style="display: inline-block; background: #2456E6; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Compléter mon dossier</a></p>
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.</p>
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

  // Pull every assignment with its form deadline, reminder state, exchange
  // reminder settings, and latest submission status. Cadence and "needs
  // action" are filtered in code.
  const { data: rows, error } = await supabase
    .from('assignments')
    .select(
      'id, last_reminded_at, student:users!student_id(email, full_name), form_templates!inner(name, deadline, exchanges!inner(name, archived_at, reminders_enabled, reminder_cadence)), submissions(status)',
    )

  if (error) {
    console.error('[send-reminders] query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // Group due forms per student email, tracking which assignment ids to stamp
  // and which exchanges are involved (for the subject/body wording).
  const perStudent = new Map<
    string,
    { name: string; forms: ReminderForm[]; assignmentIds: string[]; exchangeNames: Set<string> }
  >()

  for (const row of (rows ?? []) as any[]) {
    // submissions is one-to-one with assignments, so PostgREST returns it as an
    // object (not an array). Handle both shapes defensively.
    const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
    const status: string | undefined = submission?.status
    if (status === 'approved' || status === 'submitted') continue

    const exchange = row.form_templates?.exchanges
    if (exchange?.archived_at) continue
    // Master switch: the organizer turned automatic reminders off for this
    // exchange. Manual « Relancer » is unaffected (it lives in the app).
    if (exchange?.reminders_enabled === false) continue

    const deadline: string | undefined = row.form_templates?.deadline
    if (!deadline) continue

    const daysLeft = daysUntil(deadline)
    // Unknown/missing cadence resolves to 'normale' — never fail the run on it.
    const preset = resolvePreset(exchange?.reminder_cadence)
    if (!isDue(daysLeft, row.last_reminded_at, preset)) continue

    const student = row.student
    if (!student?.email) continue

    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, {
        name: student.full_name ?? '',
        forms: [],
        assignmentIds: [],
        exchangeNames: new Set<string>(),
      })
    }
    const bucket = perStudent.get(student.email)!
    bucket.forms.push({ name: row.form_templates.name, deadline, overdue: daysLeft < 0 })
    bucket.assignmentIds.push(row.id)
    if (exchange?.name) bucket.exchangeNames.add(exchange.name)
  }

  const nowIso = new Date().toISOString()
  let sent = 0
  for (const [email, { name, forms, assignmentIds, exchangeNames }] of perStudent) {
    const anyOverdue = forms.some(f => f.overdue)
    const ref = dossierRef([...exchangeNames], false)
    const subject = anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`

    const ok = await sendEmail(email, subject, buildEmail(name, [...exchangeNames], forms))
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
