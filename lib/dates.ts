// Locale date helpers shared across UI and email. No React, no Supabase.

// "12 sept." style French short date; empty string for null/invalid input.
export function frShortDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date)
  return formatted.replace(/\.$/, '')
}
