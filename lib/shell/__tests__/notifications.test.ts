import { describe, it, expect } from 'vitest'
import { badgeCount, buildNotificationGroups, newestNotificationAt, type NotificationRow } from '@/lib/shell/notifications'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026' },
  { id: 'ex2', name: 'Espagne–Canada 2025' },
]

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    exchange_id: 'ex1',
    kind: 'applications_to_review',
    total: 3,
    new_count: 2,
    newest_at: '2026-07-29T08:00:00Z',
    ...over,
  }
}

describe('badgeCount', () => {
  it('sums new_count across rows', () => {
    expect(badgeCount([row({ new_count: 2 }), row({ kind: 'late', new_count: 5 })])).toBe(7)
  })

  it('ignores total — only new_count drives the badge', () => {
    expect(badgeCount([row({ total: 99, new_count: 0 })])).toBe(0)
  })

  it('ignores unknown kinds', () => {
    expect(badgeCount([row({ kind: 'something_else', new_count: 4 })])).toBe(0)
  })

  it('returns 0 for empty, null and undefined', () => {
    expect(badgeCount([])).toBe(0)
    expect(badgeCount(null)).toBe(0)
    expect(badgeCount(undefined)).toBe(0)
  })
})

describe('newestNotificationAt', () => {
  it('returns the maximum newest_at as epoch ms', () => {
    expect(
      newestNotificationAt([
        row({ newest_at: '2026-07-29T08:00:00Z' }),
        row({ kind: 'late', newest_at: '2026-07-29T11:00:00Z' }),
        row({ kind: 'submissions_to_review', newest_at: '2026-07-29T09:00:00Z' }),
      ]),
    ).toBe(Date.parse('2026-07-29T11:00:00Z'))
  })

  // The reason this is not a string max: mixed offsets order differently
  // lexicographically than they do in time. '2026-07-29T09:00:00+02:00' is
  // 07:00Z — EARLIER than '2026-07-29T08:00:00Z' — but sorts after it.
  it('compares instants, not strings, across offsets', () => {
    expect(
      newestNotificationAt([
        row({ newest_at: '2026-07-29T08:00:00Z' }),
        row({ kind: 'late', newest_at: '2026-07-29T09:00:00+02:00' }),
      ]),
    ).toBe(Date.parse('2026-07-29T08:00:00Z'))
  })

  it('ignores unknown kinds, non-positive totals, null and unparseable stamps', () => {
    expect(newestNotificationAt([row({ kind: 'bogus', newest_at: '2027-01-01T00:00:00Z' })])).toBeNull()
    expect(newestNotificationAt([row({ total: 0, newest_at: '2027-01-01T00:00:00Z' })])).toBeNull()
    expect(newestNotificationAt([row({ newest_at: null })])).toBeNull()
    expect(newestNotificationAt([row({ newest_at: 'pas une date' })])).toBeNull()
  })

  it('returns null for empty, null and undefined', () => {
    expect(newestNotificationAt([])).toBeNull()
    expect(newestNotificationAt(null)).toBeNull()
    expect(newestNotificationAt(undefined)).toBeNull()
  })

  it('is unaffected by new_count — it is about arrival time, not newness', () => {
    expect(newestNotificationAt([row({ new_count: 0, newest_at: '2026-07-29T08:00:00Z' })]))
      .toBe(Date.parse('2026-07-29T08:00:00Z'))
  })
})

describe('buildNotificationGroups', () => {
  it('groups by exchange and names them', () => {
    const groups = buildNotificationGroups([row()], exchanges)
    expect(groups).toHaveLength(1)
    expect(groups[0].exchangeId).toBe('ex1')
    expect(groups[0].exchangeName).toBe('France–Canada 2026')
    expect(groups[0].items).toEqual([{ kind: 'applications_to_review', total: 3, isNew: true }])
  })

  it('orders groups by the caller’s exchange order, not by row order', () => {
    const groups = buildNotificationGroups(
      [row({ exchange_id: 'ex2' }), row({ exchange_id: 'ex1' })],
      exchanges,
    )
    expect(groups.map((g) => g.exchangeId)).toEqual(['ex1', 'ex2'])
  })

  it('orders items by a fixed kind order, not by row order', () => {
    const groups = buildNotificationGroups(
      [row({ kind: 'late' }), row({ kind: 'submissions_to_review' }), row({ kind: 'applications_to_review' })],
      exchanges,
    )
    expect(groups[0].items.map((i) => i.kind)).toEqual([
      'applications_to_review',
      'submissions_to_review',
      'late',
    ])
  })

  it('drops rows whose exchange is not visible to the caller', () => {
    expect(buildNotificationGroups([row({ exchange_id: 'ex-archived' })], exchanges)).toEqual([])
  })

  it('drops unknown kinds and non-positive totals', () => {
    expect(buildNotificationGroups([row({ kind: 'bogus' })], exchanges)).toEqual([])
    expect(buildNotificationGroups([row({ total: 0 })], exchanges)).toEqual([])
  })

  it('marks isNew false when new_count is 0 but still lists the item', () => {
    const groups = buildNotificationGroups([row({ new_count: 0 })], exchanges)
    expect(groups[0].items[0]).toEqual({ kind: 'applications_to_review', total: 3, isNew: false })
  })

  it('returns [] for empty, null and undefined', () => {
    expect(buildNotificationGroups([], exchanges)).toEqual([])
    expect(buildNotificationGroups(null, exchanges)).toEqual([])
    expect(buildNotificationGroups(undefined, exchanges)).toEqual([])
  })
})
