// email-copy.ts — pure French copy builders for the send-reminders cron email.
//
// Extracted from index.ts so the copy is unit-testable under vitest (index.ts
// itself cannot be imported there: Deno.serve, `npm:` import specifier,
// top-level Deno.env.get). Same testability pattern as ./pacing.ts and
// ./filter.ts. Keep this module pure: no Deno globals, no imports.
//
// French typography rule: user-facing copy uses the typographic apostrophe (’),
// never the ASCII quote (') — email-copy.test.ts enforces this.

export type ReminderForm = { name: string; deadline: string; overdue: boolean }

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

// Subject line for one student's reminder email (absorbed from the inline
// subject construction in index.ts's send loop).
export function buildSubject(exchangeNames: string[], anyOverdue: boolean): string {
  const ref = dossierRef(exchangeNames, false)
  return anyOverdue ? `Action requise : ${ref}` : `Rappel : ${ref}`
}

export function buildEmail(studentName: string, exchangeNames: string[], forms: ReminderForm[], appUrl: string): string {
  const greeting = studentName ? `Bonjour ${esc(studentName)},` : 'Bonjour,'
  const items = forms
    .map(f => {
      const due = esc(frShortDate(f.deadline))
      const label = f.overdue
        ? `<span style="color: #b91c1c;">en retard — date limite ${due}</span>`
        : `date limite ${due}`
      return `<li style="margin-bottom: 6px;"><strong>${esc(f.name)}</strong> — ${label}</li>`
    })
    .join('')
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1F3A30;">
      <h2 style="font-weight: 700; letter-spacing: -0.02em; font-size: 20px;"><span style="color: #3FA277;">Eazy</span>Exchange</h2>
      <p>${greeting}</p>
      <p>Il manque encore ${forms.length === 1 ? 'cet élément' : 'ces éléments'} à ${dossierRef(exchangeNames, true)} :</p>
      <ul style="padding-left: 18px;">${items}</ul>
      <p><a href="${appUrl}/my-forms" style="display: inline-block; background: #2456E6; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px;">Compléter mon dossier</a></p>
      <hr style="border: none; border-top: 1px solid #E7F1EC; margin: 24px 0;" />
      <p style="font-size: 12px; color: #5C7268;">Tu reçois cet e-mail car ton dossier d’échange scolaire est en cours de préparation sur Eazyexchange.</p>
    </div>
  `
}
