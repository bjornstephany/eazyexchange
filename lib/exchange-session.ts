export const ACTIVE_EXCHANGE_COOKIE = 'ee_active_exchange'

// `exchanges` must be ordered most-recent-first (created_at desc).
// An explicit cookie selection wins even if archived (dossiers stay
// consultable); the fallback prefers the most recent NON-archived exchange.
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
