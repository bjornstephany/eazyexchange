// Pure ordering helpers for the organizer sidebar's exchange list. No React,
// no Supabase: the server sorts with sortExchanges before rendering, and the
// client's drop handler computes the next order with reorderIds.

/**
 * Apply an organizer's personal order to a list of exchanges.
 *
 * Exchanges absent from `order` come FIRST, keeping their incoming sequence
 * (the layout supplies created_at desc), so a newly created exchange stays
 * where the organizer expects it instead of being buried under a hand-ordered
 * list. Because every drop persists the complete id list, "unlisted" only ever
 * means "created since your last drag" — the state self-heals after one
 * reorder. Ids in `order` that match no exchange (deleted, or no longer
 * visible under RLS) are ignored.
 */
export function sortExchanges<T extends { id: string }>(exchanges: T[], order: string[]): T[] {
  if (order.length === 0) return exchanges

  const rank = new Map<string, number>()
  order.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i) // first occurrence wins
  })

  const unlisted: T[] = []
  const listed: T[] = []
  for (const exchange of exchanges) {
    ;(rank.has(exchange.id) ? listed : unlisted).push(exchange)
  }
  listed.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)

  return [...unlisted, ...listed]
}

/**
 * Move `activeId` to the index currently held by `overId`.
 *
 * Returns the SAME array reference when the move is a no-op (dropped on
 * itself, or either id is unknown) so callers can skip the state update and
 * the server round trip with a cheap identity check.
 */
export function reorderIds(ids: string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1 || from === to) return ids

  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
