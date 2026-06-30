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

function layout(body: string, footer = "You're receiving this because you have forms to complete for a student exchange."): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1F3A30;">
      <h2 style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px;">
        <span style="color: #3FA277;">Eazy</span>Exchange
      </h2>
      ${body}
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">${footer}</p>
    </div>
  `
}

async function send(to: string, subject: string, html: string, label: string): Promise<void> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  // Log only the error category name — never the raw error object, which can
  // echo the recipient address (PII) in Resend validation messages.
  if (error) console.error(`[email] ${label} failed:`, (error as { name?: string }).name ?? 'unknown error')
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
    <p><a href="${link}" style="display: inline-block; background: #1F7A57; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Update your submission</a></p>
  `)

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `Action needed: ${opts.formName}`,
    html,
  })
  if (error) {
    // Don't fail the caller's action just because the email bounced; log only
    // the error category (never the raw error — it can echo the recipient PII).
    console.error('[email] rejection email failed:', (error as { name?: string }).name ?? 'unknown error')
  }
}

const APP_FOOTER = "You're receiving this because you applied (or were invited to apply) to a student exchange."

export async function sendApplicationResumeEmail(opts: { to: string; exchangeName: string; resumeUrl: string }): Promise<void> {
  const html = layout(`
    <p>Hi,</p>
    <p>Here's your private link to continue your application for <strong>${esc(opts.exchangeName)}</strong>. You can leave and come back anytime, on any device:</p>
    <p><a href="${opts.resumeUrl}" style="display:inline-block;background:#1F7A57;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Continue my application</a></p>
    <p style="font-size:12px;color:#5C7268;">Keep this email — it's the only way back to your in-progress application.</p>
  `, APP_FOOTER)
  await send(opts.to, `Continue your application — ${opts.exchangeName}`, html, 'application resume email')
}

export async function sendApplicationConfirmationEmail(opts: { to: string; applicantName: string; exchangeName: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const html = layout(`
    <p>${greeting}</p>
    <p>We've received your application for <strong>${esc(opts.exchangeName)}</strong>. The organizer will review it and be in touch.</p>
  `, APP_FOOTER)
  await send(opts.to, `Application received — ${opts.exchangeName}`, html, 'application confirmation email')
}

export async function sendNewApplicationAlertEmail(opts: { to: string; applicantName: string; exchangeName: string; reviewUrl: string }): Promise<void> {
  const html = layout(`
    <p>A new application has arrived for <strong>${esc(opts.exchangeName)}</strong> from <strong>${esc(opts.applicantName)}</strong>.</p>
    <p><a href="${opts.reviewUrl}" style="display:inline-block;background:#1F7A57;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Review applications</a></p>
  `)
  await send(opts.to, `New application — ${opts.exchangeName}`, html, 'new application alert email')
}

export async function sendInvitationEmail(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const html = layout(`
    <p>${greeting}</p>
    <p>Great news — you've been accepted into <strong>${esc(opts.exchangeName)}</strong>! Please let the organizer know whether you'd like to join:</p>
    <p><a href="${opts.respondUrl}" style="display:inline-block;background:#1F7A57;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Respond to your invitation</a></p>
  `, APP_FOOTER)
  await send(opts.to, `You're invited — ${opts.exchangeName}`, html, 'invitation email')
}

export async function sendApplicationRejectionEmail(opts: { to: string; applicantName: string; exchangeName: string; note: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const note = opts.note ? `<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">${esc(opts.note).replace(/\n/g, '<br>')}</p>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Thank you for applying to <strong>${esc(opts.exchangeName)}</strong>. After careful consideration, we're unable to offer you a place this time.</p>
    ${note}
    <p>We wish you all the best.</p>
  `, APP_FOOTER)
  await send(opts.to, `Update on your application — ${opts.exchangeName}`, html, 'application rejection email')
}
