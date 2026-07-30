// Shaping for the header bell. Pure — no React, no Supabase — so the branching
// part is unit-testable without a database. The layout hands the raw rows from
// organizer_notifications() straight through; OrganizerShell shapes them here.

export const NOTIFICATION_KINDS = [
  'applications_to_review',
  'submissions_to_review',
  'late',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

// `kind` is a plain string because it arrives from Postgres, not from a union
// the type system enforces. Everything below narrows it before trusting it.
export type NotificationRow = {
  exchange_id: string
  kind: string
  total: number
  new_count: number
  newest_at: string | null
}

export type NotificationItem = { kind: NotificationKind; total: number; isNew: boolean }
export type NotificationGroup = {
  exchangeId: string
  exchangeName: string
  items: NotificationItem[]
}

function isKind(kind: string): kind is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

/**
 * The badge number. Only `new_count` drives it — never `total`. That is the
 * whole reason the watermark exists: badging the total would leave the bell
 * permanently red for a school with a chronically overdue élève.
 */
export function badgeCount(rows: NotificationRow[] | null | undefined): number {
  if (!rows) return 0
  return rows.reduce((n, r) => (isKind(r.kind) && r.new_count > 0 ? n + r.new_count : n), 0)
}

/**
 * The newest event time across the rows, as epoch milliseconds, or null when
 * there is nothing to compare.
 *
 * Epoch milliseconds rather than the raw string on purpose: `newest_at` is a
 * Postgres `timestamptz` serialized by PostgREST, and nothing guarantees a
 * single offset across rows, so lexicographic comparison of the strings is not
 * safe. `Date.parse` normalizes to an instant.
 *
 * This is what the badge's "already looked at" check compares against, instead
 * of the badge COUNT: counts drop back to 0 after every stamp and climb again
 * through small integers, so comparing counts hides a genuinely new item
 * whenever the count lands back on a value the organizer once dismissed.
 */
export function newestNotificationAt(rows: NotificationRow[] | null | undefined): number | null {
  if (!rows) return null
  let newest: number | null = null
  for (const r of rows) {
    // Same admission rule as buildNotificationGroups: an item the panel would
    // not list must not make the badge reappear either.
    if (!isKind(r.kind) || r.total <= 0 || !r.newest_at) continue
    const at = Date.parse(r.newest_at)
    if (Number.isNaN(at)) continue
    if (newest === null || at > newest) newest = at
  }
  return newest
}

/**
 * Group rows under exchange names.
 *
 * `exchanges` must arrive in DISPLAY order — the same sortExchanges output the
 * sidebar renders — so the bell and the sidebar can never disagree about
 * ordering. Iterating `exchanges` rather than `rows` also drops any row whose
 * exchange the viewer cannot see, without a second lookup.
 */
export function buildNotificationGroups(
  rows: NotificationRow[] | null | undefined,
  exchanges: { id: string; name: string }[],
): NotificationGroup[] {
  if (!rows || rows.length === 0) return []

  const byExchange = new Map<string, NotificationItem[]>()
  for (const r of rows) {
    if (!isKind(r.kind) || r.total <= 0) continue
    const items = byExchange.get(r.exchange_id) ?? []
    items.push({ kind: r.kind, total: r.total, isNew: r.new_count > 0 })
    byExchange.set(r.exchange_id, items)
  }

  const groups: NotificationGroup[] = []
  for (const ex of exchanges) {
    const items = byExchange.get(ex.id)
    if (!items || items.length === 0) continue
    // Fixed order, not data-driven, so the panel does not reshuffle between
    // renders as counts change.
    items.sort(
      (a, b) => NOTIFICATION_KINDS.indexOf(a.kind) - NOTIFICATION_KINDS.indexOf(b.kind),
    )
    groups.push({ exchangeId: ex.id, exchangeName: ex.name, items })
  }
  return groups
}
