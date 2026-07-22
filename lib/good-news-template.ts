// Pure, unit-tested rendering of the per-exchange "Bonne nouvelle" parent email.
// Shared by BOTH the Settings authoring preview and the email renderer
// (lib/email.ts) so the two surfaces can never drift.
//
// Placeholders — the ONLY dynamic tokens an organizer may use:
//   {{student_name}}   {{exchange_name}}
// Everything else (dates, costs, links, passport warning, confirmation
// deadline) is identical for every family in the exchange and is typed
// literally into the body by the organizer.

export const DEFAULT_GOOD_NEWS_SUBJECT =
  'Bonne nouvelle — {{student_name}} est retenu·e pour {{exchange_name}} !'

export const DEFAULT_GOOD_NEWS_BODY = `Bonjour,

Nous avons le plaisir de vous annoncer que la candidature de {{student_name}} pour l'échange {{exchange_name}} a été retenue !

Cette confirmation vaudra engagement définitif de votre famille. Merci de bien vouloir prendre connaissance des informations suivantes :

• Dates du séjour : [à compléter]
• Participation aux frais : [à compléter]
• Adhésion / paiement : [lien ou modalités à compléter]
• Passeport : vérifiez que celui de votre enfant est valide au-delà de la date de retour.
• Date limite de confirmation : [à compléter]

Merci d'indiquer votre décision à l'aide des boutons ci-dessous.`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function substitute(text: string, vars: { studentName: string; exchangeName: string }): string {
  return text
    .replaceAll('{{student_name}}', vars.studentName)
    .replaceAll('{{exchange_name}}', vars.exchangeName)
}

export function renderGoodNews(opts: {
  subject: string | null
  body: string | null
  studentName: string
  exchangeName: string
}): { subject: string; bodyHtml: string } {
  const rawSubject = (opts.subject ?? '').trim() || DEFAULT_GOOD_NEWS_SUBJECT
  const rawBody = (opts.body ?? '').trim() || DEFAULT_GOOD_NEWS_BODY
  const vars = { studentName: opts.studentName, exchangeName: opts.exchangeName }
  const subject = substitute(rawSubject, vars)
  // Substitute FIRST, then escape the whole string, so both organizer-authored
  // markup and any markup in the substituted names are neutralized.
  const bodyHtml = escapeHtml(substitute(rawBody, vars)).replace(/\n/g, '<br>')
  return { subject, bodyHtml }
}
