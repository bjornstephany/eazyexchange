import { describe, it, expect } from 'vitest'
import { groupHistory, type CommunicationEvent } from '@/lib/communication/history'

// Timestamps are pinned to mid-day UTC so the local-day bucketing is identical
// in Paris (CI runs UTC, Bjorn runs UTC+1/+2) — the assertions below are about
// grouping, not about time zones.
function ev(over: Partial<CommunicationEvent> & { id: string; createdAt: string }): CommunicationEvent {
  return { kind: 'info_published', subject: 'T', status: 'ok', ...over }
}

describe('groupHistory', () => {
  it('returns nothing for no events', () => {
    expect(groupHistory([])).toEqual([])
  })

  it('buckets by day, newest day first', () => {
    const days = groupHistory([
      ev({ id: 'a', createdAt: '2026-07-20T12:00:00.000Z' }),
      ev({ id: 'b', createdAt: '2026-07-22T12:00:00.000Z' }),
      ev({ id: 'c', createdAt: '2026-07-21T12:00:00.000Z' }),
    ])
    expect(days.map(d => d.entries[0].id)).toEqual(['b', 'c', 'a'])
    expect(days).toHaveLength(3)
  })

  it('orders entries newest-first inside a day', () => {
    const [day] = groupHistory([
      ev({ id: 'early', createdAt: '2026-07-22T09:00:00.000Z' }),
      ev({ id: 'late', createdAt: '2026-07-22T15:00:00.000Z' }),
    ])
    expect(day.entries.map(e => e.id)).toEqual(['late', 'early'])
  })

  it('keeps info events one line each, carrying kind and subject', () => {
    const [day] = groupHistory([
      ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z', kind: 'info_deleted', subject: 'Point de rendez-vous' }),
    ])
    expect(day.entries).toEqual([{
      type: 'info', id: 'a', at: '2026-07-22T12:00:00.000Z',
      kind: 'info_deleted', subject: 'Point de rendez-vous',
    }])
  })

  it('collapses all good-news sends in a day into one row, stamped with the last', () => {
    const [day] = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-22T09:00:00.000Z', kind: 'good_news_sent', subject: 'Marie Dupont' }),
      ev({ id: 'g2', createdAt: '2026-07-22T15:00:00.000Z', kind: 'good_news_sent', subject: 'Théo Leroy' }),
    ])
    expect(day.entries).toHaveLength(1)
    const entry = day.entries[0]
    expect(entry.type).toBe('good_news')
    if (entry.type !== 'good_news') throw new Error('unreachable')
    expect(entry.at).toBe('2026-07-22T15:00:00.000Z')
    expect(entry.sent).toBe(2)
    expect(entry.failed).toBe(0)
    expect(entry.recipients.map(r => r.subject)).toEqual(['Théo Leroy', 'Marie Dupont'])
  })

  it('counts failures separately within the collapsed row', () => {
    const [day] = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-22T09:00:00.000Z', kind: 'good_news_sent', subject: 'A', status: 'ok' }),
      ev({ id: 'g2', createdAt: '2026-07-22T10:00:00.000Z', kind: 'good_news_sent', subject: 'B', status: 'ok' }),
      ev({ id: 'g3', createdAt: '2026-07-22T11:00:00.000Z', kind: 'good_news_sent', subject: 'C', status: 'failed' }),
    ])
    const entry = day.entries[0]
    if (entry.type !== 'good_news') throw new Error('unreachable')
    expect(entry.sent).toBe(2)
    expect(entry.failed).toBe(1)
  })

  it('does NOT collapse good-news sends across two different days', () => {
    const days = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-21T12:00:00.000Z', kind: 'good_news_sent', subject: 'A' }),
      ev({ id: 'g2', createdAt: '2026-07-22T12:00:00.000Z', kind: 'good_news_sent', subject: 'B' }),
    ])
    expect(days).toHaveLength(2)
    expect(days.every(d => d.entries.length === 1)).toBe(true)
  })

  it('sorts a collapsed good-news row against info events by its own stamp', () => {
    const [day] = groupHistory([
      ev({ id: 'g1', createdAt: '2026-07-22T09:00:00.000Z', kind: 'good_news_sent', subject: 'A' }),
      ev({ id: 'i1', createdAt: '2026-07-22T11:00:00.000Z', kind: 'info_published', subject: 'Info' }),
      ev({ id: 'g2', createdAt: '2026-07-22T13:00:00.000Z', kind: 'good_news_sent', subject: 'B' }),
    ])
    // The good-news row stamps at 13:00, so it sorts above the 11:00 info line.
    expect(day.entries.map(e => e.type)).toEqual(['good_news', 'info'])
  })

  it('gives the day a stable key and a representative timestamp for the header', () => {
    const [day] = groupHistory([ev({ id: 'a', createdAt: '2026-07-22T12:00:00.000Z' })])
    expect(day.key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(day.at).toBe('2026-07-22T12:00:00.000Z')
  })
})
