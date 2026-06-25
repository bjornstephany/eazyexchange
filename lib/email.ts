import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'EazyExchange <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Returns a Resend client, or null if no API key is configured (e.g. local dev).
// Callers should treat a null client as "email disabled" rather than an error.
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
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

function layout(body: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="font-weight: 600;">EazyExchange</h2>
      ${body}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">You're receiving this because you have forms to complete for a student exchange.</p>
    </div>
  `
}

export async function sendRejectionEmail(opts: {
  to: string
  studentName: string
  formName: string
  note: string
  assignmentId: string
}): Promise<void> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping rejection email')
    return
  }

  // assignmentId is a server-generated UUID; encode defensively all the same.
  const link = `${APP_URL}/my-forms/${encodeURIComponent(opts.assignmentId)}`
  const greeting = opts.studentName ? `Hi ${esc(opts.studentName)},` : 'Hi,'
  const note = esc(opts.note).replace(/\n/g, '<br>')

  const html = layout(`
    <p>${greeting}</p>
    <p>Your submission for <strong>${esc(opts.formName)}</strong> needs some changes before it can be approved.</p>
    <p style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #b91c1c;">
      <strong>Organizer note:</strong> ${note}
    </p>
    <p><a href="${link}" style="display: inline-block; background: #0f172a; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Update your submission</a></p>
  `)

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Action needed: ${opts.formName}`,
    html,
  })
  if (error) {
    // Don't fail the caller's action just because the email bounced; log it.
    console.error('[email] rejection email failed:', error)
  }
}
