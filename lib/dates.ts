// Locale date helpers shared across UI and email. No React, no Supabase.

// "12 sept" style French short date, or "12 sept. 2026" with { year: true };
// empty string for null/invalid input. Only a *trailing* period is stripped, so
// the abbreviation keeps its period when a year follows it.
export function frShortDate(iso: string | null, opts?: { year?: boolean }): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', ...(opts?.year ? { year: 'numeric' } : {}),
  }).format(date)
  return formatted.replace(/\.$/, '')
}

// "12 septembre 2026" style French long date; empty string for null/invalid
// input. Used for tooltips where the year matters and space does not.
export function fullDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
