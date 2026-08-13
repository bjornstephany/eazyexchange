import { Resend } from 'resend'
import { shortDate } from '@/lib/dates'
import { getAppUrl } from '@/lib/app-url'
import { EXCHANGE_TERMS_EMAIL } from '@/lib/exchange-terms'
import { logEmailSend, type EmailLogContext } from '@/lib/email-log'
import { renderGoodNews } from '@/lib/good-news-template'
import type { GoodNewsValues } from '@/lib/exchange/good-news-fields'

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

// A file travelling with the mail. `content` is base64 — Resend's own wire
// format — so nothing here has to hold a Buffer type.
type EmailAttachment = { filename: string; content: string }

async function send(
  to: string | string[], subject: string, html: string, label: string,
  ctx?: EmailLogContext, attachments?: EmailAttachment[],
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping ${label}`)
    return false
  }
  const recipient = Array.isArray(to) ? to.join(', ') : to
  try {
    const { error } = await resend.emails.send({
      from: FROM, to, subject, html,
      ...(attachments?.length ? { attachments } : {}),
    })
    if (error) {
      logSendError(label, error)
      await logEmailSend({
        recipient, kind: label, status: 'error',
        errorCode: (error as { statusCode?: number }).statusCode ?? null,
        ...ctx,
      })
      return false
    }
    await logEmailSend({ recipient, kind: label, status: 'sent', ...ctx })
    return true
  } catch {
    console.error(`[email] ${label} failed: send threw`)
    await logEmailSend({ recipient, kind: label, status: 'error', ...ctx })
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
  ctx?: EmailLogContext
}): Promise<void> {
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
    <p><a href="${link}" style="display: inline-block; background: #2456E6; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Update your submission</a></p>
  `)

  // Don't fail the caller's action just because the email bounced: send()
  // already swallows and logs failures.
  await send(opts.to, `Action needed: ${opts.formName}`, html, 'rejection email', opts.ctx)
}

const APP_FOOTER = "You're receiving this because you applied (or were invited to apply) to a student exchange."
const ORG_FOOTER = "You're receiving this because you're an organizer for this exchange on Eazyexchange."

// French footer for the acceptance email only. The English APP_FOOTER stays:
// the other application emails (resume, confirmation, rejection) still use it
// and are out of scope here.
const APP_FOOTER_FR = 'Tu reçois cet e-mail car tu as candidaté (ou as été invité·e à candidater) à un échange scolaire.'

export async function sendApplicationResumeEmail(opts: { to: string; exchangeName: string; resumeUrl: string; ctx?: EmailLogContext }): Promise<void> {
  const html = layout(`
    <p>Hi,</p>
    <p>Here's your private link to continue your application for <strong>${esc(opts.exchangeName)}</strong>. You can leave and come back anytime, on any device:</p>
    <p><a href="${opts.resumeUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Continue my application</a></p>
    <p style="font-size:12px;color:#5C7268;">Keep this email — it's the only way back to your in-progress application.</p>
  `, APP_FOOTER)
  await send(opts.to, `Continue your application — ${opts.exchangeName}`, html, 'application resume email', opts.ctx)
}

export async function sendApplicationInviteEmail(opts: { to: string; exchangeName: string; applyUrl: string; ctx?: EmailLogContext }): Promise<void> {
  const html = layout(`
    <p>Hi,</p>
    <p>You've been invited to apply for <strong>${esc(opts.exchangeName)}</strong>. You can save and finish later on any device.</p>
    <p><a href="${opts.applyUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Start my application</a></p>
    <p style="font-size:12px;color:#5C7268;">Keep this email — it's your private link back to your application.</p>
  `, APP_FOOTER)
  await send(opts.to, `You're invited to apply — ${opts.exchangeName}`, html, 'application invite email', opts.ctx)
}

export async function sendApplicationConfirmationEmail(opts: { to: string; applicantName: string; exchangeName: string; ctx?: EmailLogContext }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const html = layout(`
    <p>${greeting}</p>
    <p>We've received your application for <strong>${esc(opts.exchangeName)}</strong>. The organizer will review it and be in touch.</p>
  `, APP_FOOTER)
  await send(opts.to, `Application received — ${opts.exchangeName}`, html, 'application confirmation email', opts.ctx)
}

export async function sendNewApplicationAlertEmail(opts: { to: string; applicantName: string; exchangeName: string; reviewUrl: string; ctx?: EmailLogContext }): Promise<void> {
  const html = layout(`
    <p>A new application has arrived for <strong>${esc(opts.exchangeName)}</strong> from <strong>${esc(opts.applicantName)}</strong>.</p>
    <p><a href="${opts.reviewUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Review applications</a></p>
  `, ORG_FOOTER)
  await send(opts.to, `New application — ${opts.exchangeName}`, html, 'new application alert email', opts.ctx)
}

export async function sendInvitationEmail(opts: { to: string; applicantName: string; exchangeName: string; respondUrl: string; ctx?: EmailLogContext }): Promise<void> {
  const greeting = opts.applicantName ? `Bonjour ${esc(opts.applicantName)},` : 'Bonjour,'
  const html = layout(`
    <p>${greeting}</p>
    <p>Bonne nouvelle — ta candidature pour <strong>${esc(opts.exchangeName)}</strong> a été retenue ! Dis-nous si tu veux participer :</p>
    <p><a href="${opts.respondUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Répondre à l’invitation</a></p>
    <p style="font-size:12px;color:#5C7268;">${EXCHANGE_TERMS_EMAIL}</p>
  `, APP_FOOTER_FR)
  await send(opts.to, `Bonne nouvelle — ta candidature pour ${opts.exchangeName} a été retenue !`, html, 'invitation email', opts.ctx)
}

// System-controlled button label, keyed by the applicant's language. NEVER part
// of the organizer-editable body — appended by the renderer so an organizer
// cannot break the response link.
//
// One button, not three: the yes / no / peut-être trio all landed on
// /invite/<token>, which then asked the same question again. The `?r=` deep
// links are gone from new sends, but app/invite/[token]/page.tsx still honours
// the parameter — every acceptance email already in a parent's inbox carries it.
const GOOD_NEWS_BUTTON: Record<'en' | 'fr', string> = {
  fr: 'Répondre à l’invitation',
  en: 'Respond to the invitation',
}

export async function sendGoodNewsEmail(opts: {
  to: string[]
  studentName: string
  exchangeName: string
  subject: string | null
  body: string | null
  respondUrl: string
  language: 'en' | 'fr'
  // Réglages → Programme values that fill the template's {{travel_dates}} &c.
  // The caller has already refused to send if any of them is still missing
  // (templateHasUnfilledPlaceholders in actions/applications-review.ts).
  details?: GoodNewsValues | null
  // Free text typed by the organizer when they change their mind about an
  // application they had rejected. Organizer-authored → always escaped.
  personalNote?: string | null
  ctx?: EmailLogContext
}): Promise<boolean> {
  const { subject, bodyHtml } = renderGoodNews({
    subject: opts.subject, body: opts.body,
    studentName: opts.studentName, exchangeName: opts.exchangeName,
    details: opts.details ?? null,
  })
  const noteHtml = opts.personalNote?.trim()
    ? `<p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${esc(opts.personalNote.trim()).replace(/\n/g, '<br>')}</p>`
    : ''
  const button =
    `<a href="${opts.respondUrl}" style="display:block;text-align:center;background:#2456E6;color:#fff;text-decoration:none;padding:12px 16px;border-radius:9px;font-weight:600;">${esc(GOOD_NEWS_BUTTON[opts.language])}</a>`
  const html = layout(`${bodyHtml}${noteHtml}<div style="margin-top:20px;">${button}</div>`, APP_FOOTER_FR)
  return send(opts.to, subject, html, 'good news email', opts.ctx)
}

export async function sendStudentSetupEmail(opts: {
  to: string
  exchangeName: string
  setupUrl: string
  ctx?: EmailLogContext
}): Promise<void> {
  const html = layout(`
    <p>Bonjour,</p>
    <p>Tes parents ont confirmé ta participation à <strong>${esc(opts.exchangeName)}</strong> — bravo ! Crée ton accès pour commencer ton dossier :</p>
    <p><a href="${opts.setupUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Créer mon compte</a></p>
  `, STUDENT_FOOTER)
  await send(opts.to, `Crée ton accès — ${opts.exchangeName}`, html, 'student setup email', opts.ctx)
}

export async function sendApplicationRejectionEmail(opts: { to: string; applicantName: string; exchangeName: string; note: string; ctx?: EmailLogContext }): Promise<void> {
  const greeting = opts.applicantName ? `Hi ${esc(opts.applicantName)},` : 'Hi,'
  const note = opts.note ? `<p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${esc(opts.note).replace(/\n/g, '<br>')}</p>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Thank you for applying to <strong>${esc(opts.exchangeName)}</strong>. After careful consideration, we're unable to offer you a place this time.</p>
    ${note}
    <p>We wish you all the best.</p>
  `, APP_FOOTER)
  await send(opts.to, `Update on your application — ${opts.exchangeName}`, html, 'application rejection email', opts.ctx)
}

const STUDENT_FOOTER = 'Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.'

export async function sendTemplateReminderEmail(opts: {
  to: string; studentName: string; templateName: string; exchangeName: string; deadline: string | null
  ctx?: EmailLogContext
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const due = opts.deadline ? ` avant le <strong>${esc(shortDate(opts.deadline, 'fr'))}</strong>` : ''
  const html = layout(`
    <p>${greeting}</p>
    <p>Il manque encore « <strong>${esc(opts.templateName)}</strong> » à ton dossier pour <strong>${esc(opts.exchangeName)}</strong>. Merci de le compléter${due}.</p>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Compléter mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Rappel : ${opts.templateName} — ${opts.exchangeName}`, html, 'template reminder email', opts.ctx)
}

export async function sendStudentReminderEmail(opts: {
  to: string; studentName: string; exchangeName: string
  items: { name: string; deadline: string | null }[]
  ctx?: EmailLogContext
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const n = opts.items.length
  const rows = opts.items.map(i =>
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — date limite ${esc(shortDate(i.deadline, 'fr'))}` : ''}</li>`
  ).join('')
  const html = layout(`
    <p>${greeting}</p>
    <p>Il manque encore ${n === 1 ? 'cet élément' : 'ces éléments'} à ton dossier pour <strong>${esc(opts.exchangeName)}</strong> :</p>
    <ul>${rows}</ul>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Compléter mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Rappel : ton dossier pour ${opts.exchangeName}`, html, 'student reminder email', opts.ctx)
}

export async function sendChecklistEmail(opts: {
  to: string; studentName: string; exchangeName: string; items: { name: string; deadline: string | null }[]
  ctx?: EmailLogContext
}): Promise<boolean> {
  const greeting = opts.studentName ? `Bonjour ${esc(opts.studentName)},` : 'Bonjour,'
  const rows = opts.items.map(i =>
    `<li><strong>${esc(i.name)}</strong>${i.deadline ? ` — date limite ${esc(shortDate(i.deadline, 'fr'))}` : ''}</li>`
  ).join('')
  const html = layout(`
    <p>${greeting}</p>
    <p>La préparation de <strong>${esc(opts.exchangeName)}</strong> commence ! Voici ce qu’il reste à compléter dans ton dossier :</p>
    <ul>${rows}</ul>
    <p><a href="${APP_URL}/my-forms" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Ouvrir mon dossier</a></p>
  `, STUDENT_FOOTER)
  return send(opts.to, `Ton dossier pour ${opts.exchangeName} — c’est parti !`, html, 'checklist email', opts.ctx)
}

const ORGANIZER_FOOTER = "Vous recevez cet e-mail car un collègue vous invite à rejoindre son équipe sur Eazyexchange."

export async function sendOrganizerInviteEmail(opts: {
  to: string; inviterName: string; schoolName: string; joinUrl: string
  ctx?: EmailLogContext
}): Promise<boolean> {
  const school = opts.schoolName.trim() ? esc(opts.schoolName) : "son établissement"
  const html = layout(`
    <p>Bonjour,</p>
    <p><strong>${esc(opts.inviterName)}</strong> vous invite à rejoindre <strong>${school}</strong> sur Eazyexchange pour gérer ensemble les échanges scolaires : élèves, candidatures, formulaires et documents.</p>
    <p><a href="${opts.joinUrl}" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Créer mon compte</a></p>
    <p style="font-size:13px;">Ce lien est valable 14 jours.</p>
  `, ORGANIZER_FOOTER)
  return send(opts.to, `${opts.inviterName} vous invite sur Eazyexchange`, html, 'organizer invite email', opts.ctx)
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

// An organizer sending us the application form they already use, so we can add
// it to the library. UNLIKE every other notification here, this one is the
// DELIVERY, not an alert about something already stored: there is no bucket and
// no object, the attachment is the only copy we ever see. That is why it
// reports whether it sent — the action turns a false into a visible failure
// rather than swallowing it, so an organizer is never told « reçu » about a
// file that went nowhere.
export async function sendTemplateRequestEmail(opts: {
  schoolName: string
  organizerName: string
  organizerEmail: string
  note: string | null
  filename: string
  content: string
}): Promise<boolean> {
  const to = process.env.FEEDBACK_EMAIL
  if (!to) {
    console.warn('[email] FEEDBACK_EMAIL not set — skipping template request email')
    return false
  }

  const note = opts.note ? esc(opts.note).replace(/\n/g, '<br>') : null
  const html = layout(`
    <p><strong>Demande de modèle</strong> — ${esc(opts.schoolName)}</p>
    <p style="font-size:13px;color:#5C7268;">De ${esc(opts.organizerName)} · ${esc(opts.organizerEmail)}</p>
    <p style="font-size:13px;">Fichier joint : <strong>${esc(opts.filename)}</strong></p>
    ${note ? `<p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">${note}</p>` : ''}
    <p style="font-size:13px;color:#5C7268;">Promis sous 48 h.</p>
  `, ORG_FOOTER)

  return send(
    to, `Demande de modèle — ${opts.schoolName}`, html, 'template request email',
    undefined, [{ filename: opts.filename, content: opts.content }],
  )
}

// A school claimed with country != 'FR' skips the registry check, so it needs a
// pair of human eyes. Same posture as the feedback widget: best-effort, the row
// in `schools` is the source of truth, and FEEDBACK_EMAIL is optional.
// Triage: select id, name, country, created_at from schools where uai is null;
//
// No caller since 2026-08-13: its one caller, actions/onboarding.ts, is
// parked with the rest of the removed /onboarding flow, so this alert never
// fires. Left in place, alongside its caller, per this branch's parking
// discipline — not deleted. If it is ever wired back up, fix the triage query
// above first: `uai` was set only by the claim_school() step that flow used
// to run, so with that gone `uai is null` now matches every school, not just
// the non-FR ones this was meant to flag.
export async function sendUnverifiedSchoolEmail(opts: {
  schoolName: string
  country: string
  organizerName: string
}): Promise<void> {
  const to = process.env.FEEDBACK_EMAIL
  if (!to) return

  const html = layout(`
    <p><strong>Nouvel établissement non vérifié</strong></p>
    <p style="font-size:13px;color:#5C7268;">
      Pays déclaré : ${esc(opts.country)} — hors annuaire, aucune vérification automatique.
    </p>
    <p style="background:#EAF7F0;border:1px solid #E7F1EC;border-radius:8px;padding:12px;">
      ${esc(opts.schoolName)}<br>
      <span style="font-size:13px;color:#5C7268;">Déclaré par ${esc(opts.organizerName)}</span>
    </p>
  `, ORG_FOOTER)
  await send(
    to,
    `Établissement à vérifier — ${opts.schoolName} (${opts.country})`,
    html,
    'unverified school notification',
  )
}

const ADMIN_FOOTER = 'Notification interne Eazyexchange.'

// Recipients for owner-facing alerts. Deliberately ADMIN_EMAILS and not
// FEEDBACK_EMAIL: FEEDBACK_EMAIL is optional by design and is not confirmed
// set in Vercel prod, which would drop signup alerts silently. ADMIN_EMAILS is
// confirmed set there and is now read only here — /admin and isPlatformAdmin
// are gone (2026-07-30 waitlist change).
function adminRecipients(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

// Someone who is not on signup_allowlist tried to create an account. No auth
// user, no school and no users row were created — only a signup_waitlist row.
//
// Awaited, not fire-and-forget, for the same reason as the failure alert:
// send() swallows its own errors and returns a boolean, so awaiting cannot fail
// a signup — whereas a `void` call is dropped when the serverless function
// freezes after the response, i.e. exactly when the alert matters.
export async function sendWaitlistNotificationEmail(opts: {
  fullName: string
  email: string
  source: 'password' | 'google'
}): Promise<void> {
  const to = adminRecipients()
  if (to.length === 0) return

  // `source` is a closed union, so it needs no escaping; fullName and email do.
  const provider = opts.source === 'google' ? 'Google' : 'e-mail / mot de passe'

  const html = layout(`
    <p><strong>Nouvelle inscription en liste d’attente</strong></p>
    <p style="font-size:14px;">
      <strong>${esc(opts.fullName || '—')}</strong><br>
      ${esc(opts.email)}<br>
      <span style="font-size:13px;color:#5C7268;">Via ${provider}</span>
    </p>
    <p style="font-size:13px;color:#5C7268;">
      Aucun compte n’a été créé. Pour ouvrir l’accès à cette personne, ajoutez son
      adresse à la table <strong>signup_allowlist</strong> depuis le tableau de bord
      Supabase ; la liste complète se consulte dans <strong>signup_waitlist</strong>.
    </p>
  `, ADMIN_FOOTER)
  await send(to, 'Nouvelle inscription en liste d’attente', html, 'waitlist notification email')
}

// Provisioning failed after the user confirmed their email: no users row, no
// trace anywhere. This is exactly how the 2026-07-24 signup was nearly missed —
// and a Database Webhook on users INSERT would have the same blind spot, since
// there is no row to fire on.
export async function sendSignupFailureEmail(opts: {
  email: string
  reason: string
}): Promise<void> {
  const to = adminRecipients()
  if (to.length === 0) return

  const html = layout(`
    <p><strong>Échec de création de compte</strong></p>
    <p style="font-size:14px;">
      ${esc(opts.email)} a confirmé son e-mail mais le provisionnement a échoué.<br>
      <span style="color:#5C7268;">Raison : ${esc(opts.reason)}</span>
    </p>
    <p style="font-size:13px;color:#5C7268;">
      Aucune ligne n’a été créée dans users : il ne reste aucune trace de cette
      personne côté application.
    </p>
  `, ADMIN_FOOTER)
  await send(to, 'Échec de création de compte Eazyexchange', html, 'signup failure email')
}
