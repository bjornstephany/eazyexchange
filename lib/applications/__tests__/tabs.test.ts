import { describe, it, expect } from 'vitest'
import { TAB_KEYS, parseTab, matchesTab } from '@/lib/applications/tabs'
import type { AppRow } from '@/lib/dashboard/rollup'

function app(status: string): AppRow {
  return { id: 'x', status, submitted_at: '2026-09-01', responded_at: null, data: {}, email: 'a@b.fr' }
}

describe('parseTab', () => {
  it('accepts every declared tab key', () => {
    for (const key of TAB_KEYS) expect(parseTab(key)).toBe(key)
  })
  it('falls back to all for unknown, empty and missing values', () => {
    expect(parseTab('nope')).toBe('all')
    expect(parseTab('')).toBe('all')
    expect(parseTab(undefined)).toBe('all')
  })
})

describe('matchesTab', () => {
  it('puts every status in exactly one non-all tab', () => {
    const statuses = ['invited', 'draft', 'submitted', 'accepted', 'maybe', 'enrolling', 'enrolled', 'rejected', 'declined']
    for (const status of statuses) {
      const hits = TAB_KEYS.filter(k => k !== 'all' && matchesTab(app(status), k))
      expect(hits).toHaveLength(1)
    }
  })
  it('keeps declined out of the rejected tab', () => {
    expect(matchesTab(app('declined'), 'rejected')).toBe(false)
    expect(matchesTab(app('declined'), 'declined')).toBe(true)
  })
  it('all matches everything', () => {
    expect(matchesTab(app('draft'), 'all')).toBe(true)
  })
})
