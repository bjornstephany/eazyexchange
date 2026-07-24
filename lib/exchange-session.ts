export const ACTIVE_EXCHANGE_COOKIE = 'ee_active_exchange'

// `exchanges` must arrive in DISPLAY order — the organizer layout applies the
// personal drag order (lib/shell/exchange-order.ts) on top of created_at desc
// before calling this. An explicit cookie selection wins even if archived
// (dossiers stay consultable); the fallback picks the first NON-archived
// exchange in that display order, so the default now honours the organizer's
// own ordering rather than pure recency.
export function resolveActiveExchange<T extends { id: string; archived?: boolean }>(
  exchanges: T[],
  cookieValue: string | undefined
): T | null {
  if (exchanges.length === 0) return null
  return (
    exchanges.find((e) => e.id === cookieValue) ??
    exchanges.find((e) => !e.archived) ??
    exchanges[0]
  )
}
