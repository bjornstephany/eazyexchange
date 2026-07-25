import { describe, it, expect } from 'vitest'
import { shortDate, longDate } from '@/lib/dates'

describe('shortDate', () => {
  it('strips the trailing period in fr only', () => {
    expect(shortDate('2026-09-18', 'fr')).toBe('18 sept')
    // German conventionally keeps the period on an abbreviated month.
    expect(shortDate('2026-09-18', 'de')).toMatch(/\.$/)
    expect(shortDate('2026-09-18', 'de')).toContain('18.')
  })
  it('keeps a mid-string period when the year follows', () => {
    expect(shortDate('2026-09-18', 'fr', { year: true })).toBe('18 sept. 2026')
  })
  it('renders en day-month-first via en-GB, never month-first', () => {
    expect(shortDate('2026-09-18', 'en')).toMatch(/^18 Sep/)
    expect(shortDate('2026-09-18', 'en', { year: true })).toMatch(/^18 Sep\w* 2026$/)
  })
  it('renders es and it in their own language', () => {
    expect(shortDate('2026-09-18', 'es')).toBe('18 sept')
    expect(shortDate('2026-09-18', 'it')).toBe('18 set')
  })
  it('accepts a full timestamptz', () => {
    expect(shortDate('2026-09-18T12:00:00.000+00:00', 'fr', { year: true })).toBe('18 sept. 2026')
  })
  it('returns an empty string for null, empty and invalid input', () => {
    expect(shortDate(null, 'fr', { year: true })).toBe('')
    expect(shortDate('', 'de')).toBe('')
    expect(shortDate('not-a-date', 'en')).toBe('')
  })
})

describe('longDate', () => {
  it('formats each locale in its own language', () => {
    expect(longDate('2026-09-18', 'fr')).toBe('18 septembre 2026')
    expect(longDate('2026-09-18', 'de')).toBe('18. September 2026')
    expect(longDate('2026-09-18', 'it')).toBe('18 settembre 2026')
    expect(longDate('2026-09-18', 'es')).toBe('18 de septiembre de 2026')
    expect(longDate('2026-09-18', 'en')).toBe('18 September 2026')
  })
  it('accepts a full timestamptz', () => {
    expect(longDate('2026-09-18T12:00:00.000+00:00', 'fr')).toBe('18 septembre 2026')
  })
  it('returns an empty string for null, empty and invalid input', () => {
    expect(longDate(null, 'fr')).toBe('')
    expect(longDate('', 'fr')).toBe('')
    expect(longDate('not-a-date', 'fr')).toBe('')
  })
})
