import { describe, it, expect } from 'vitest'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

const exchanges = [
  { id: 'b', name: 'Espagne 2027' },
  { id: 'a', name: 'France–Canada 2026' },
]

describe('resolveActiveExchange', () => {
  it('returns the exchange matching the cookie', () => {
    expect(resolveActiveExchange(exchanges, 'a')?.id).toBe('a')
  })
  it('falls back to the most recent (first) exchange on a stale cookie', () => {
    expect(resolveActiveExchange(exchanges, 'deleted-id')?.id).toBe('b')
  })
  it('falls back to the most recent exchange when no cookie', () => {
    expect(resolveActiveExchange(exchanges, undefined)?.id).toBe('b')
  })
  it('returns null when there are no exchanges', () => {
    expect(resolveActiveExchange([], 'a')).toBeNull()
  })
  it('exports the cookie name', () => {
    expect(ACTIVE_EXCHANGE_COOKIE).toBe('ee_active_exchange')
  })
})
