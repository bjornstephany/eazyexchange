// Pure per-row reminder decision for send-reminders. No Deno globals and no
// path aliases — imported by index.ts (Deno, as './filter.ts') and unit-tested
// under vitest (filter.test.ts). tsconfig excludes supabase/functions, so
// vitest is the only automated check on this file.
//
// Decides whether one assignment row (as fetched by index.ts) should trigger
// a reminder today. index.ts keeps fetching, per-student grouping, sending,
// and stamping last_reminded_at.

import { resolvePreset, isDue } from './pacing.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// Whole days from now until an ISO date (UTC). Negative when the date is past.
export function daysUntil(isoDate: string): number {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const target = new Date(`${isoDate}T00:00:00Z`)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

// The slice of the PostgREST assignment row this decision reads. The real row
// has more fields (id, student, form name) — structural typing accepts it.
export type ReminderRow = {
  last_reminded_at: string | null
  form_templates: {
    deadline: string | null
    exchanges: {
      archived_at: string | null
      reminders_enabled: boolean | null
      reminder_cadence: string | null
    } | null
  } | null
  submissions: { status: string } | { status: string }[] | null
}

export type ReminderDecision = { deadline: string; daysLeft: number }

// null = skip. Otherwise the deadline and whole days left (negative = overdue)
// that the grouping/email code needs.
export function shouldRemind(row: ReminderRow): ReminderDecision | null {
  // submissions is one-to-one with assignments, so PostgREST returns it as an
  // object (not an array). Handle both shapes defensively.
  const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions
  const status = submission?.status
  if (status === 'approved' || status === 'submitted') return null

  const exchange = row.form_templates?.exchanges
  if (exchange?.archived_at) return null
  // Master switch: the organizer turned automatic reminders off for this
  // exchange. Manual « Relancer » is unaffected (it lives in the app).
  if (exchange?.reminders_enabled === false) return null

  const deadline = row.form_templates?.deadline
  if (!deadline) return null

  const daysLeft = daysUntil(deadline)
  // Unknown/missing cadence resolves to 'normale' — never fail the run on it.
  const preset = resolvePreset(exchange?.reminder_cadence)
  if (!isDue(daysLeft, row.last_reminded_at, preset)) return null

  return { deadline, daysLeft }
}
