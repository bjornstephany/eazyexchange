// Pure, unit-tested rendering of the per-exchange "Bonne nouvelle" parent email.
// Shared by BOTH the Settings authoring preview and the email renderer
// (lib/email.ts) so the two surfaces can never drift.
//
// Placeholders — the dynamic tokens an organizer may use:
//   {{student_name}}    {{exchange_name}}          from the application
//   {{travel_dates}}    {{participation_cost}}
//   {{payment_details}} {{confirmation_deadline}}  from Réglages → Programme
//
// The second group is filled from the exchange_program_details row, so the
// organizer types the price and the deadline once instead of once per template.
// A BLANK value deliberately leaves its token unsubstituted — that is what
// hasUnfilledPlaceholders detects, and it is the whole mechanism behind the
// never-send-a-blank guard in actions/applications-review.ts.

import { frShortDate } from '@/lib/dates'
import type { GoodNewsValues } from '@/lib/exchange/good-news-fields'

export const DEFAULT_GOOD_NEWS_SUBJECT =
  'Bonne nouvelle — {{student_name}} est retenu·e pour {{exchange_name}} !'

export const DEFAULT_GOOD_NEWS_BODY = `Bonjour,

Nous avons le plaisir de vous annoncer que la candidature de {{student_name}} pour l'échange {{exchange_name}} a été retenue !

Cette confirmation vaudra engagement définitif de votre famille. Merci de bien vouloir prendre connaissance des informations suivantes :

• Dates du séjour : {{travel_dates}}
• Participation aux frais : {{participation_cost}}
• Adhésion / paiement : {{payment_details}}
• Passeport : vérifiez que celui de votre enfant est valide au-delà de la date de retour.
• Date limite de confirmation : {{confirmation_deadline}}

Merci d'indiquer votre décision à l'aide du bouton ci-dessous.`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function blank(v: string | null | undefined): boolean {
  return (v ?? '').trim() === ''
}

// Null means "not available": the caller leaves the token in place rather than
// rendering an empty bullet, so the guard can still see what is missing.
function detailValues(d: GoodNewsValues | null): Record<string, string | null> {
  if (!d) return {}
  const period = blank(d.travel_start) || blank(d.travel_end)
    ? null
    : `du ${frShortDate(d.travel_start, { year: true })} au ${frShortDate(d.travel_end, { year: true })}`
  return {
    '{{travel_dates}}': period,
    '{{participation_cost}}': blank(d.participation_cost) ? null : d.participation_cost!.trim(),
    '{{payment_details}}': blank(d.payment_details) ? null : d.payment_details!.trim(),
    '{{confirmation_deadline}}': blank(d.confirmation_deadline)
      ? null
      : frShortDate(d.confirmation_deadline, { year: true }),
  }
}

// Substitutes only the Réglages-sourced tokens. Exported for the guard, which
// scans the text with these filled in but the *names* left out of it.
export function fillDetails(text: string, details: GoodNewsValues | null): string {
  let out = text
  for (const [token, value] of Object.entries(detailValues(details))) {
    if (value !== null) out = out.replaceAll(token, value)
  }
  return out
}

function substituteNames(text: string, vars: { studentName: string; exchangeName: string }): string {
  return text
    .replaceAll('{{student_name}}', vars.studentName)
    .replaceAll('{{exchange_name}}', vars.exchangeName)
}

// Matches anything that reads as "someone meant to fill this in later":
//   {{token}}   a token whose value is still missing
//   [anything]  a placeholder the organizer typed by hand ([à compléter],
//               [à préciser], [XXX]) — which a database-only check would miss.
// It also catches [[chip]] text, which reaches storage only when an editor chip
// failed to convert back.
//
// Known cost: a body containing legitimate bracketed prose is refused. Accepted,
// because GoodNewsCard shows this same warning live while the organizer types,
// so it surfaces at authoring time rather than against a real candidate.
const PLACEHOLDER = /\{\{[^}]*\}\}|\[[^\]\n]{2,}\]/

export function hasUnfilledPlaceholders(text: string): boolean {
  return PLACEHOLDER.test(text)
}

// The send-side gate. Resolves the same defaults renderGoodNews would, fills the
// Réglages tokens, drops the name tokens (a name is not a placeholder, and no
// student's name should be able to trigger or suppress the guard), then scans
// what is left of subject and body.
export function templateHasUnfilledPlaceholders(opts: {
  subject: string | null
  body: string | null
  details: GoodNewsValues | null
}): boolean {
  const subject = (opts.subject ?? '').trim() || DEFAULT_GOOD_NEWS_SUBJECT
  const body = (opts.body ?? '').trim() || DEFAULT_GOOD_NEWS_BODY
  const scannable = (text: string) =>
    substituteNames(fillDetails(text, opts.details), { studentName: '', exchangeName: '' })
  return hasUnfilledPlaceholders(scannable(subject)) || hasUnfilledPlaceholders(scannable(body))
}

const ALL_TOKENS = /\{\{(student_name|exchange_name|travel_dates|participation_cost|payment_details|confirmation_deadline)\}\}/g

// Placeholder text that filling Réglages will NOT fix, because the organizer
// typed it themselves. Reported separately from the missing-field list so the
// block message can point at the template editor rather than at Réglages —
// a body can carry both problems at once.
export function templateHasLiteralPlaceholders(opts: {
  subject: string | null
  body: string | null
}): boolean {
  const subject = (opts.subject ?? '').trim() || DEFAULT_GOOD_NEWS_SUBJECT
  const body = (opts.body ?? '').trim() || DEFAULT_GOOD_NEWS_BODY
  const stripped = (text: string) => text.replace(ALL_TOKENS, '')
  return hasUnfilledPlaceholders(stripped(subject)) || hasUnfilledPlaceholders(stripped(body))
}

export function renderGoodNews(opts: {
  subject: string | null
  body: string | null
  studentName: string
  exchangeName: string
  details?: GoodNewsValues | null
}): { subject: string; bodyHtml: string } {
  const rawSubject = (opts.subject ?? '').trim() || DEFAULT_GOOD_NEWS_SUBJECT
  const rawBody = (opts.body ?? '').trim() || DEFAULT_GOOD_NEWS_BODY
  const vars = { studentName: opts.studentName, exchangeName: opts.exchangeName }
  const details = opts.details ?? null
  const subject = substituteNames(fillDetails(rawSubject, details), vars)
  // Substitute FIRST, then escape the whole string, so organizer-authored markup,
  // markup in the substituted names, and markup in the Réglages values are all
  // neutralized by one pass.
  const bodyHtml = escapeHtml(substituteNames(fillDetails(rawBody, details), vars)).replace(/\n/g, '<br>')
  return { subject, bodyHtml }
}
