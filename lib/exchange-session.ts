export const ACTIVE_EXCHANGE_COOKIE = 'ee_active_exchange'

// `exchanges` must be ordered most-recent-first (created_at desc).
export function resolveActiveExchange<T extends { id: string }>(
  exchanges: T[],
  cookieValue: string | undefined
): T | null {
  if (exchanges.length === 0) return null
  return exchanges.find((e) => e.id === cookieValue) ?? exchanges[0]
}
