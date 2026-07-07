// Pure pacing logic for send-reminders. No Deno globals and no path aliases —
// imported by index.ts (Deno, as './pacing.ts') and unit-tested under vitest
// (pacing.test.ts). tsconfig excludes supabase/functions, so vitest is the
// only automated check on this file.
//
// A preset answers two questions: how often may we remind while the deadline
// is far away, and how close to the deadline (in days) do reminders switch to
// daily? Overdue assignments count as "past the deadline", i.e. inside the
// final stretch whenever the preset has one.
//   douce      — every 7 days, never accelerates
//   normale    — every 7 days, daily during the last 7 days and while overdue
//   insistante — every 3 days, daily during the last 14 days and while overdue

export type ReminderCadence = 'douce' | 'normale' | 'insistante'

export type PacingPreset = {
  farIntervalDays: number
  // Days before the deadline where reminders become daily (overdue included).
  // 0 = never accelerate.
  finalStretchDays: number
}

export const PRESETS: Record<ReminderCadence, PacingPreset> = {
  douce: { farIntervalDays: 7, finalStretchDays: 0 },
  normale: { farIntervalDays: 7, finalStretchDays: 7 },
  insistante: { farIntervalDays: 3, finalStretchDays: 14 },
}

// Unknown/missing cadence must never abort a cron run — fall back to normale.
export function resolvePreset(cadence: unknown): PacingPreset {
  return PRESETS[cadence as ReminderCadence] ?? PRESETS.normale
}

const DAY_MS = 24 * 60 * 60 * 1000

// Whether a reminder is due given whole days until the deadline (negative =
// overdue) and when we last reminded.
export function isDue(daysLeft: number, lastRemindedAt: string | null, preset: PacingPreset): boolean {
  const inFinalStretch = preset.finalStretchDays > 0 && daysLeft <= preset.finalStretchDays
  const minIntervalDays = inFinalStretch ? 1 : preset.farIntervalDays
  if (!lastRemindedAt) return true
  const elapsedDays = (Date.now() - new Date(lastRemindedAt).getTime()) / DAY_MS
  // Tolerance: the cron fires at a fixed 08:00 but last_reminded_at is stamped
  // a few seconds later, so consecutive runs are elapsed-wise just under 24h
  // apart. Without the 0.5-day slack a `>= 1` daily gate would skip every
  // other day.
  return elapsedDays >= minIntervalDays - 0.5
}
