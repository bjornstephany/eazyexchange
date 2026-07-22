import { describe, it, expect } from 'vitest'
import { frShortDate, fullDate } from '@/lib/dates'

describe('frShortDate', () => {
  it('omits the year by default, with no trailing period', () => {
    expect(frShortDate('2026-09-18')).toBe('18 sept')
  })
  it('includes the year with { year: true }, keeping the mid-string period', () => {
    expect(frShortDate('2026-09-18', { year: true })).toBe('18 sept. 2026')
  })
  it('keeps the year across a month with no abbreviating period', () => {
    expect(frShortDate('2026-05-04', { year: true })).toBe('4 mai 2026')
  })
  it('accepts a full timestamptz', () => {
    expect(frShortDate('2026-09-18T12:00:00.000+00:00', { year: true })).toBe('18 sept. 2026')
  })
  it('returns an empty string for null and empty input', () => {
    expect(frShortDate(null, { year: true })).toBe('')
    expect(frShortDate('')).toBe('')
  })
  it('guards invalid dates', () => {
    expect(frShortDate('not-a-date', { year: true })).toBe('')
  })
})

describe('fullDate', () => {
  it('formats a date-only ISO string in French with the year', () => {
    expect(fullDate('2026-09-18')).toBe('18 septembre 2026')
  })
  it('accepts a full timestamptz', () => {
    expect(fullDate('2026-09-18T12:00:00.000+00:00')).toBe('18 septembre 2026')
  })
  it('returns an empty string for null and empty input', () => {
    expect(fullDate(null)).toBe('')
    expect(fullDate('')).toBe('')
  })
  it('guards invalid dates', () => {
    expect(fullDate('not-a-date')).toBe('')
  })
})
