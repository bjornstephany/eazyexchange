// Calendar-grid math for DateField. String-first on purpose: a deadline is a
// calendar date, not an instant, and the moment it becomes a Date in UTC terms
// it starts drifting by a day for half the planet. Nothing here calls
// toISOString(), and nothing here should.
//
// `month` is 0-based throughout, matching Date, so the two never have to be
// mentally converted at a call site.

import type { Locale } from '@/lib/i18n/config'

const pad = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` from calendar parts, by string arithmetic only. */
export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. The local-parts Date
  // constructor never converts, so this is safe.
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Parses `YYYY-MM-DD`, strictly. Returns null for anything else — including the
 * empty string, a two-digit year, and 30 February — so a caller can treat a
 * non-null result as a real day.
 */
export function parseISODate(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  if (month < 0 || month > 11) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

/**
 * 0 for Sunday, 1 for Monday. Intl.Locale.prototype.getWeekInfo would answer
 * this, but it is not in every browser the app supports, and the answer for
 * five known locales fits in one line.
 */
export function firstDayOfWeek(locale: Locale): 0 | 1 {
  return locale === 'en' ? 0 : 1
}

/**
 * The month as whole weeks of ISO date strings, with null in the cells that
 * belong to the neighbouring months. Whole weeks so the grid is rectangular and
 * the renderer needs no special case for the first and last rows.
 */
export function monthGrid(locale: Locale, year: number, month: number): (string | null)[][] {
  const lead = (new Date(year, month, 1).getDay() - firstDayOfWeek(locale) + 7) % 7
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth(year, month) }, (_, i) => toISODate(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Steps the view month by `delta`, rolling the year over at both ends. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const m = month + delta
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
}

/** Today as a calendar date in the viewer's own timezone. */
export function todayISO(): string {
  const now = new Date()
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate())
}
