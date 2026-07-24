// Pure grouping for Communication → Historique. No React, no Supabase.
// The rendering rules ("one row per day-bucket of good-news sends", "info
// events stay one line each") are behaviour, so they live here and are tested
// without a DOM.
//
// The two unions are defined ONCE, in ./events, and imported type-only here so
// the kind list cannot drift between the write side and the read side. The
// `import type` is erased at build time, so pulling this module into a client
// component drags in nothing from ./events at runtime.
import type { CommunicationEventKind, CommunicationEventStatus } from './events'

export type { CommunicationEventKind, CommunicationEventStatus }

export type CommunicationEvent = {
  id: string
  createdAt: string
  kind: CommunicationEventKind
  subject: string
  status: CommunicationEventStatus
}

export type InfoEventKind = 'info_published' | 'info_updated' | 'info_deleted'

export type HistoryEntry =
  | { type: 'info'; id: string; at: string; kind: InfoEventKind; subject: string }
  | {
      type: 'good_news'; id: string; at: string
      sent: number; failed: number
      recipients: { id: string; subject: string; status: CommunicationEventStatus }[]
    }

export type HistoryDay = {
  key: string   // 'YYYY-MM-DD' in the viewer's local zone — bucket identity only
  at: string    // ISO of the newest event in the bucket; formats the header
  entries: HistoryEntry[]
}

// Local calendar day, not UTC: a 23:00 Paris publication belongs to that
// evening, not to the next morning.
function dayKey(iso: string): string {
  const d = new Date(iso)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const desc = (a: string, b: string) => new Date(b).getTime() - new Date(a).getTime()

export function groupHistory(events: CommunicationEvent[]): HistoryDay[] {
  const buckets = new Map<string, CommunicationEvent[]>()
  for (const e of events) {
    const key = dayKey(e.createdAt)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(e)
    else buckets.set(key, [e])
  }

  const days: HistoryDay[] = []
  for (const [key, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => desc(a.createdAt, b.createdAt))

    const entries: HistoryEntry[] = []
    const goodNews = sorted.filter(e => e.kind === 'good_news_sent')
    for (const e of sorted) {
      if (e.kind === 'good_news_sent') continue
      entries.push({
        type: 'info', id: e.id, at: e.createdAt,
        kind: e.kind as InfoEventKind, subject: e.subject,
      })
    }

    // Every send in the day collapses into one row stamped with the LAST one.
    // Two separate accepts on the same day merging is acceptable — arguably
    // desirable: the organizer thinks in "the day we told the families".
    if (goodNews.length > 0) {
      entries.push({
        type: 'good_news',
        id: `good-news-${key}`,
        at: goodNews[0].createdAt,
        sent: goodNews.filter(e => e.status === 'ok').length,
        failed: goodNews.filter(e => e.status === 'failed').length,
        recipients: goodNews.map(e => ({ id: e.id, subject: e.subject, status: e.status })),
      })
    }

    entries.sort((a, b) => desc(a.at, b.at))
    days.push({ key, at: entries[0]?.at ?? sorted[0].createdAt, entries })
  }

  days.sort((a, b) => desc(a.at, b.at))
  return days
}
