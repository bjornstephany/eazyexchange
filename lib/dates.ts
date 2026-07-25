// Locale date helpers shared across UI and email. No React, no Supabase.

import type { Locale } from '@/lib/i18n/config'

// BCP-47 tag per app locale. `en` maps to en-GB so dates read day-month like
// the rest of the product (see lib/pdf/application-recap.tsx); every other
// locale uses its bare tag.
const BCP47: Record<Locale, string> = {
  en: 'en-GB', fr: 'fr', es: 'es', it: 'it', de: 'de',
}

function parse(iso: string | null): Date | null {
  if (!iso) return null
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? null : date
}

// "12 sept" style short date in the CALLER'S locale, or "12 sept. 2026" with
// { year: true }; empty string for null/invalid input. The locale is explicit
// and has no default on purpose — a default is how dates silently ended up
// French on every localized surface.
//
// The trailing-period strip is fr-only: French renders « 18 sept. » where the
// design wants « 18 sept », while German conventionally keeps the period on an
// abbreviated month, so stripping it there would be a new defect. Only a
// *trailing* period is stripped, so the abbreviation keeps its period when a
// year follows it.
export function shortDate(iso: string | null, locale: Locale, opts?: { year?: boolean }): string {
  const date = parse(iso)
  if (!date) return ''
  const formatted = new Intl.DateTimeFormat(BCP47[locale], {
    day: 'numeric', month: 'short', ...(opts?.year ? { year: 'numeric' } : {}),
  }).format(date)
  return locale === 'fr' ? formatted.replace(/\.$/, '') : formatted
}

// "12 septembre 2026" style long date in the caller's locale; empty string for
// null/invalid input. Used for tooltips where the year matters and space does not.
export function longDate(iso: string | null, locale: Locale): string {
  const date = parse(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat(BCP47[locale], { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

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
