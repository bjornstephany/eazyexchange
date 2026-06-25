// send-reminders — daily reminder emails for forms approaching their deadline.
//
// Runs on a daily cron (see supabase/cron-setup.sql). For every assignment whose
// form deadline is exactly 7 or 3 days away and which still needs student action
// (no submission, or status 'draft'/'rejected'), the student gets one summary
// email listing all such forms.
//
// Deno runtime. Uses the service-role key (bypasses RLS) and the Resend REST API.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'EazyExchange <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000'

function isoDateInDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type ReminderForm = { name: string; deadline: string }

function buildEmail(studentName: string, forms: ReminderForm[]): string {
  const greeting = studentName ? `Hi ${studentName},` : 'Hi,'
  const items = forms
    .map(
      f =>
        `<li style="margin-bottom: 6px;"><strong>${f.name}</strong> — due ${new Date(
          f.deadline,
        ).toLocaleDateString()}</li>`,
    )
    .join('')
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="font-weight: 600;">EazyExchange</h2>
      <p>${greeting}</p>
      <p>You have ${forms.length} form${forms.length === 1 ? '' : 's'} due soon:</p>
      <ul style="padding-left: 18px;">${items}</ul>
      <p><a href="${APP_URL}/my-forms" style="display: inline-block; background: #0f172a; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Complete your forms</a></p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">You're receiving this because you have forms to complete for a student exchange.</p>
    </div>
  `
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[send-reminders] RESEND_API_KEY not set — skipping email to', to)
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  })
  if (!res.ok) {
    console.error('[send-reminders] Resend error for', to, await res.text())
    return false
  }
  return true
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const targetDeadlines = [isoDateInDays(7), isoDateInDays(3)]

  const { data: rows, error } = await supabase
    .from('assignments')
    .select(
      'id, student:users!student_id(email, full_name), form_templates!inner(name, deadline), submissions(status)',
    )
    .in('form_templates.deadline', targetDeadlines)

  if (error) {
    console.error('[send-reminders] query failed:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  // Group forms that still need action, one bucket per student email.
  const perStudent = new Map<string, { name: string; forms: ReminderForm[] }>()
  for (const row of (rows ?? []) as any[]) {
    const status: string | undefined = row.submissions?.[0]?.status
    if (status === 'approved' || status === 'submitted') continue

    const student = row.student
    if (!student?.email) continue

    if (!perStudent.has(student.email)) {
      perStudent.set(student.email, { name: student.full_name ?? '', forms: [] })
    }
    perStudent.get(student.email)!.forms.push({
      name: row.form_templates.name,
      deadline: row.form_templates.deadline,
    })
  }

  let sent = 0
  for (const [email, { name, forms }] of perStudent) {
    const ok = await sendEmail(
      email,
      `You have ${forms.length} form${forms.length === 1 ? '' : 's'} due soon`,
      buildEmail(name, forms),
    )
    if (ok) sent++
  }

  return new Response(
    JSON.stringify({ students: perStudent.size, emailsSent: sent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
