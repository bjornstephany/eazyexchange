import { describe, it, expect } from 'vitest'
import { PRESETS, resolvePreset, isDue } from './pacing'

const DAY_MS = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

describe('resolvePreset', () => {
  it('resolves each named cadence', () => {
    expect(resolvePreset('douce')).toBe(PRESETS.douce)
    expect(resolvePreset('normale')).toBe(PRESETS.normale)
    expect(resolvePreset('insistante')).toBe(PRESETS.insistante)
  })
  it('falls back to normale for unknown or missing values', () => {
    expect(resolvePreset('weekly')).toBe(PRESETS.normale)
    expect(resolvePreset(null)).toBe(PRESETS.normale)
    expect(resolvePreset(undefined)).toBe(PRESETS.normale)
  })
})

describe('isDue — first reminder', () => {
  it('is always due when never reminded', () => {
    expect(isDue(30, null, PRESETS.douce)).toBe(true)
    expect(isDue(-3, null, PRESETS.normale)).toBe(true)
  })
})

describe('isDue — douce (weekly, no acceleration)', () => {
  it('far from deadline: weekly', () => {
    expect(isDue(30, ago(7.2), PRESETS.douce)).toBe(true)
    expect(isDue(30, ago(5), PRESETS.douce)).toBe(false)
  })
  it('stays weekly in the final week and while overdue', () => {
    expect(isDue(2, ago(1.2), PRESETS.douce)).toBe(false)
    expect(isDue(2, ago(7.2), PRESETS.douce)).toBe(true)
    expect(isDue(-10, ago(1.2), PRESETS.douce)).toBe(false)
    expect(isDue(-10, ago(7.2), PRESETS.douce)).toBe(true)
  })
})

describe('isDue — normale (current behavior)', () => {
  it('far from deadline: weekly', () => {
    expect(isDue(8, ago(7.2), PRESETS.normale)).toBe(true)
    expect(isDue(8, ago(5), PRESETS.normale)).toBe(false)
  })
  it('daily in the last 7 days and while overdue', () => {
    expect(isDue(7, ago(1.2), PRESETS.normale)).toBe(true)
    expect(isDue(-1, ago(1.2), PRESETS.normale)).toBe(true)
  })
  it('0.5-day stamp tolerance: a just-under-24h gap still counts as a day', () => {
    expect(isDue(3, ago(0.6), PRESETS.normale)).toBe(true)
    expect(isDue(3, ago(0.4), PRESETS.normale)).toBe(false)
  })
})

describe('isDue — insistante (every 3 days, daily last 14)', () => {
  it('far from deadline: every 3 days', () => {
    expect(isDue(20, ago(2.6), PRESETS.insistante)).toBe(true)
    expect(isDue(20, ago(2.4), PRESETS.insistante)).toBe(false)
  })
  it('daily within 14 days of the deadline and while overdue', () => {
    expect(isDue(14, ago(0.6), PRESETS.insistante)).toBe(true)
    expect(isDue(-2, ago(0.6), PRESETS.insistante)).toBe(true)
  })
  it('15 days out is still on the 3-day interval', () => {
    expect(isDue(15, ago(0.6), PRESETS.insistante)).toBe(false)
  })
})
