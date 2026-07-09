import { describe, it, expect } from 'vitest'
import { shouldRemind, daysUntil, type ReminderRow } from './filter'

const DAY_MS = 24 * 60 * 60 * 1000
// ISO date (YYYY-MM-DD) n days from now — matches form_templates.deadline's shape.
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)
// ISO timestamp n days ago — matches last_reminded_at's shape.
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

// A row that SHOULD remind: no submission, active exchange, reminders on,
// cadence normale, deadline 30 days out, never reminded.
function baseRow(): ReminderRow {
  return {
    last_reminded_at: null,
    form_templates: {
      deadline: inDays(30),
      exchanges: { archived_at: null, reminders_enabled: true, reminder_cadence: 'normale' },
    },
    submissions: null,
  }
}

describe('daysUntil', () => {
  it('is 0 today, positive in the future, negative in the past', () => {
    expect(daysUntil(inDays(0))).toBe(0)
    expect(daysUntil(inDays(10))).toBe(10)
    expect(daysUntil(inDays(-3))).toBe(-3)
  })
})

describe('shouldRemind — submission status', () => {
  it('reminds when there is no submission', () => {
    expect(shouldRemind(baseRow())).not.toBeNull()
  })

  it('skips approved and submitted', () => {
    for (const status of ['approved', 'submitted']) {
      const row = baseRow()
      row.submissions = { status }
      expect(shouldRemind(row)).toBeNull()
    }
  })

  it('reminds for draft and rejected', () => {
    for (const status of ['draft', 'rejected']) {
      const row = baseRow()
      row.submissions = { status }
      expect(shouldRemind(row)).not.toBeNull()
    }
  })

  it('handles the PostgREST array shape for submissions', () => {
    const skipped = baseRow()
    skipped.submissions = [{ status: 'approved' }]
    expect(shouldRemind(skipped)).toBeNull()

    const reminded = baseRow()
    reminded.submissions = []
    expect(shouldRemind(reminded)).not.toBeNull()
  })
})

describe('shouldRemind — exchange settings', () => {
  it('skips archived exchanges', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.archived_at = '2026-07-01T00:00:00Z'
    expect(shouldRemind(row)).toBeNull()
  })

  it('skips when automatic reminders are turned off', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.reminders_enabled = false
    expect(shouldRemind(row)).toBeNull()
  })

  it('still reminds when reminders_enabled is null (legacy rows)', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.reminders_enabled = null
    expect(shouldRemind(row)).not.toBeNull()
  })
})

describe('shouldRemind — deadline and pacing', () => {
  it('skips when the form has no deadline', () => {
    const row = baseRow()
    row.form_templates!.deadline = null
    expect(shouldRemind(row)).toBeNull()
  })

  it('returns the deadline and negative daysLeft when overdue', () => {
    const row = baseRow()
    row.form_templates!.deadline = inDays(-3)
    const decision = shouldRemind(row)
    expect(decision).not.toBeNull()
    expect(decision!.deadline).toBe(inDays(-3))
    expect(decision!.daysLeft).toBeLessThan(0)
  })

  it('respects the cadence via last_reminded_at (normale = weekly far out)', () => {
    const tooSoon = baseRow()
    tooSoon.last_reminded_at = ago(2)
    expect(shouldRemind(tooSoon)).toBeNull()

    const due = baseRow()
    due.last_reminded_at = ago(7.2)
    expect(shouldRemind(due)).not.toBeNull()
  })

  it('falls back to normale on an unknown cadence', () => {
    const row = baseRow()
    row.form_templates!.exchanges!.reminder_cadence = 'weekly'
    row.last_reminded_at = ago(2)
    expect(shouldRemind(row)).toBeNull()
  })
})
