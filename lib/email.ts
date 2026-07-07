import { Resend } from 'resend'
import { frShortDate } from '@/lib/dashboard/rollup'
import { getAppUrl } from '@/lib/app-url'
import { EXCHANGE_TERMS_EMAIL } from '@/lib/exchange-terms'

const FROM = process.env.EMAIL_FROM ?? 'Eazyexchange <onboarding@resend.dev>'
const APP_URL = getAppUrl()

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
        <span style="color: #2456E6;">Eazy</span>Exchange
      </h2>
      ${body}
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">${footer}</p>
    </div>
  `
}

async function send(to: string, subject: string, html: string, label: string): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return false
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) { logSendError(label, error); return false }
    return true
  } catch {
    console.error(`[email] ${label} failed: send threw`)
    return false
  }
}

// Log only the error category/status — never the raw error message, which can
// echo the recipient address (PII) in Resend validation messages. Auth (401/403)
// and sender-validation (422) errors aren't one-off bounces: they mean EVERY
// email is failing (bad RESEND_API_KEY or malformed EMAIL_FROM), so surface them
// loudly with a config hint instead of a quiet one-liner.
function logSendError(label: string, error: unknown): void {
  const e = error as { name?: string; statusCode?: number }
  const code = e.statusCode
  if (code === 401 || code === 403) {
    console.error(`[email] ${label} FAILED — auth/config error (${code} ${e.name ?? 'unknown'}). All email is broken: check RESEND_API_KEY.`)
  } else if (code === 422) {
    console.error(`[email] ${label} FAILED — validation error (422 ${e.name ?? 'unknown'}). All email may be broken: check EMAIL_FROM is a valid "Name <mailbox@verified-domain>".`)
  } else {
    console.error(`[email] ${label} failed:`, e.name ?? 'unknown error')
  }
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
  // Don't fail the caller's action just because the email bounced.
  if (error) logSendError('rejection email', error)
}

const APP_FOOTER = "You're receiving this because you applied (or were invited to apply) to a student exchange."
const ORG_FOOTER = "You're receiving this because you're an organizer for this exchange on Eazyexchange."

// French footer for the acceptance email only. The English APP_FOOTER stays:
// the other application emails (resume, confirmation, rejection) still use it
// and are out of scope here.
const APP_FOOTER_FR = 'Tu reçois cet e-mail car tu as candidaté (ou as été invité·e à candidater) à un échange scolaire.'

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
  `, ORG_FOOTER)
  await send(opts.to, `New application — ${opts.exchangeName}`, html, 'new application alert email')
}

export async function sendInvitationEmail(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string }): Promise<void> {
  const greeting = opts.applicantName ? `Bonjour ${esc(opts.applicantName)},` : 'Bonjour,'
  const html = layout(`
    <p>${greeting}</p>
    <p>Bonne nouvelle — ta candidature pour <strong>${esc(opts.exchangeName)}</strong> a été retenue ! Dis-nous si tu veux participer :</p>
    <p><a href="${opts.respondUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Répondre à l’invitation</a></p>
    <p style="font-size:12px;color:#5C7268;">${EXCHANGE_TERMS_EMAIL}</p>
  `, APP_FOOTER_FR)
  await send(opts.to, `Bonne nouvelle — ta candidature pour ${opts.exchangeName} a été retenue !`, html, 'invitation email')
}

export async function sendApplicationRejectionEmail(opts: { to: string; applicantName: string; exchangeName: string; note: string }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const note = opts.note ? `<p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${esc(opts.note).replace(/\n/g, '<br>')}</p>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Thank you for applying to <strong>${esc(opts.exchangeName)}</strong>. After careful consideration, we're unable to offer you a place this time.</p>
    ${note}
    <p>We wish you all the best.</p>
  `, APP_FOOTER)
  await send(opts.to, `Update on your application — ${opts.exchangeName}`, html, 'application rejection email')
}

const STUDENT_FOOTER = 'Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.'

export async function sendTemplateReminderEmail(opts: {
  to: string; studentName: string; templateName: string; exchangeName: string; deadline: string | null
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const due = opts.deadline ? ` avant le <strong>${esc(frShortDate(opts.deadline))}</strong>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Il manque encore « <strong>${esc(opts.templateName)}</strong> » à ton dossier pour <strong>${esc(opts.exchangeName)}</strong>. Merci de le compléter${due}.</p>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Compléter mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Rappel : ${opts.templateName} — ${opts.exchangeName}`, html, 'template reminder email')
}

export async function sendStudentReminderEmail(opts: {
  to: string; studentName: string; exchangeName: string
  items: { name: string; deadline: string | null }[]
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const n = opts.items.length
  const rows = opts.items.map(i =>
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — échéance ${esc(frShortDate(i.deadline))}` : ''}</li>`
  ).join('')
  const html = layout(`
    <p>${greeting}</p>
    <p>Il manque encore ${n === 1 ? 'cet élément' : 'ces éléments'} à ton dossier pour <strong>${esc(opts.exchangeName)}</strong> :</p>
    <ul>${rows}</ul>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Compléter mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Rappel : ton dossier pour ${opts.exchangeName}`, html, 'student reminder email')
}

export async function sendPhase2ChecklistEmail(opts: {
  to: string; studentName: string; exchangeName: string; items: { name: string; deadline: string | null }[]
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const rows = opts.items.map(i =>
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — échéance ${esc(frShortDate(i.deadline))}` : ''}</li>`
  ).join('')
  const html = layout(`
    <p>${greeting}</p>
    <p>La préparation de <strong>${esc(opts.exchangeName)}</strong> commence ! Voici ce qu’il reste à compléter dans ton dossier :</p>
    <ul>${rows}</ul>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Ouvrir mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Ton dossier pour ${opts.exchangeName} — c’est parti !`, html, 'phase-2 checklist email')
}

const ORGANIZER_FOOTER = "Vous recevez cet e-mail car un collègue vous invite à rejoindre son équipe sur Eazyexchange."

export async function sendOrganizerInviteEmail(opts: {
  to: string; inviterName: string; schoolName: string; joinUrl: string
}): Promise<boolean> {
  const school = opts.schoolName.trim() ? esc(opts.schoolName) : "son établissement"
  const html = layout(`
    <p>Bonjour,</p>
    <p><strong>${esc(opts.inviterName)}</strong> vous invite à rejoindre <strong>${school}</strong> sur Eazyexchange pour gérer ensemble les échanges scolaires : élèves, candidatures, formulaires et documents.</p>
    <p><a href="${opts.joinUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Créer mon compte</a></p>
    <p style="font-size:13px;">Ce lien est valable 14 jours.</p>
  `, ORGANIZER_FOOTER)
  return send(opts.to, `${opts.inviterName} vous invite sur Eazyexchange`, html, 'organizer invite email')
}

export async function sendFeedbackNotificationEmail(opts: {
  type: 'suggestion' | 'bug'
  schoolName: string
  organizerName: string
  pagePath: string | null
  message: string
}): Promise<void> {
  const to = process.env.FEEDBACK_EMAIL
  // Optional, Bjorn-only var: the row is the source of truth, so skip silently.
  if (!to) return

  const typeLabel = opts.type === 'bug' ? 'Bug' : 'Suggestion'
  const path = opts.pagePath ? esc(opts.pagePath) : '—'
  const message = esc(opts.message).replace(/\n/g, '<br>')
  const html = layout(`
    <p><strong>${typeLabel}</strong> — ${esc(opts.schoolName)}</p>
    <p style="font-size:13px;color:#5C7268;">De ${esc(opts.organizerName)} · page ${path}</p>
    <p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${message}</p>
  `, ORG_FOOTER)
  await send(to, `Nouveau feedback (${opts.type}) — ${opts.schoolName}`, html, 'feedback notification email')
}
