import { describe, it, expect } from 'vitest'
import {
  daysInMonth, firstDayOfWeek, monthGrid, parseISODate, shiftMonth, toISODate,
} from '@/lib/calendar'

describe('toISODate', () => {
  it('pads month and day', () => {
    expect(toISODate(2026, 0, 1)).toBe('2026-01-01')
    expect(toISODate(2026, 8, 30)).toBe('2026-09-30')
    expect(toISODate(2026, 11, 25)).toBe('2026-12-25')
  })
})

describe('parseISODate', () => {
  it('reads a well-formed date', () => {
    expect(parseISODate('2026-09-01')).toEqual({ year: 2026, month: 8, day: 1 })
  })

  it('refuses everything else, including the empty string', () => {
    for (const bad of ['', '2026-9-1', '26-09-01', 'yesterday', '2026-13-01', '2026-02-30']) {
      expect(parseISODate(bad), bad).toBeNull()
    }
  })

  it('accepts 29 February in a leap year and refuses it otherwise', () => {
    expect(parseISODate('2028-02-29')).toEqual({ year: 2028, month: 1, day: 29 })
    expect(parseISODate('2027-02-29')).toBeNull()
  })
})

describe('daysInMonth', () => {
  it('knows the short months and the leap years', () => {
    expect(daysInMonth(2026, 8)).toBe(30)   // September
    expect(daysInMonth(2027, 1)).toBe(28)   // February, common year
    expect(daysInMonth(2028, 1)).toBe(29)   // February, leap year
  })
})

describe('firstDayOfWeek', () => {
  it('starts the week on Monday everywhere but English', () => {
    expect(firstDayOfWeek('en')).toBe(0)
    for (const l of ['fr', 'es', 'it', 'de'] as const) expect(firstDayOfWeek(l)).toBe(1)
  })
})

describe('monthGrid', () => {
  // 1 September 2026 is a Tuesday; the month has 30 days.
  it('pads the first week to the locale first day', () => {
    const fr = monthGrid('fr', 2026, 8)
    expect(fr[0]).toEqual([
      null, '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ])
    const en = monthGrid('en', 2026, 8)
    expect(en[0]).toEqual([
      null, null, '2026-09-01', '2026-09-02',
      '2026-09-03', '2026-09-04', '2026-09-05',
    ])
  })

  it('returns whole weeks, so the grid is rectangular', () => {
    for (const [y, m] of [[2026, 8], [2026, 1], [2028, 1], [2026, 10]] as const) {
      const weeks = monthGrid('fr', y, m)
      for (const week of weeks) expect(week).toHaveLength(7)
      expect(weeks.flat().filter(Boolean)).toHaveLength(daysInMonth(y, m))
    }
  })

  it('holds every day of the month exactly once, in order', () => {
    const days = monthGrid('fr', 2026, 8).flat().filter(Boolean)
    expect(days[0]).toBe('2026-09-01')
    expect(days[days.length - 1]).toBe('2026-09-30')
  })

  it('does not drift with the viewer timezone', () => {
    // The regression test for toISOString(), which converts to UTC first and
    // turns 1 September into 31 August west of Greenwich.
    const original = process.env.TZ
    try {
      for (const tz of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
        process.env.TZ = tz
        expect(toISODate(2026, 8, 1), tz).toBe('2026-09-01')
        expect(monthGrid('fr', 2026, 8)[0]![1], tz).toBe('2026-09-01')
      }
    } finally {
      process.env.TZ = original
    }
  })
})

describe('shiftMonth', () => {
  it('steps within a year', () => {
    expect(shiftMonth(2026, 8, 1)).toEqual({ year: 2026, month: 9 })
    expect(shiftMonth(2026, 8, -1)).toEqual({ year: 2026, month: 7 })
  })

  it('rolls the year over at both ends', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
  })
})
