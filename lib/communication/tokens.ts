// The good-news template is STORED as mustache ({{student_name}},
// {{exchange_name}}) — lib/good-news-template.ts, lib/email.ts and every row
// already in prod depend on that and are untouched. But a schoolteacher must
// never see mustache, so the editor shows a human-readable surface form and
// this module converts between the two on the way in and out.
//
//   toEditor('{{student_name}}')             → '[[Prénom et nom de l’élève]]'
//   toStored('[[Prénom et nom de l’élève]]') → '{{student_name}}'
//
// Labels are localized; storage never is. Switching locale simply re-renders
// with the new label. `[[…]]` plus the exact localized label makes accidental
// collision implausible; unmatched brackets degrade to literal text because the
// replacement is an exact-string swap, never a pattern match.

export type TokenLabels = { studentName: string; exchangeName: string }

export function tokenChip(label: string): string {
  return `[[${label}]]`
}

const MUSTACHE = {
  studentName: '{{student_name}}',
  exchangeName: '{{exchange_name}}',
} as const

export function toEditor(stored: string, labels: TokenLabels): string {
  return stored
    .replaceAll(MUSTACHE.studentName, tokenChip(labels.studentName))
    .replaceAll(MUSTACHE.exchangeName, tokenChip(labels.exchangeName))
}

export function toStored(editorText: string, labels: TokenLabels): string {
  return editorText
    .replaceAll(tokenChip(labels.studentName), MUSTACHE.studentName)
    .replaceAll(tokenChip(labels.exchangeName), MUSTACHE.exchangeName)
}
