import { describe, it, expect } from 'vitest'
import { fullDate } from '@/lib/dates'

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
