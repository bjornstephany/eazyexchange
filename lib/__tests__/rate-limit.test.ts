import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn(async (_fn: string, _args: unknown) =>
  ({ data: true as boolean | null, error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (fn: string, args: unknown) => rpcMock(fn, args) }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import {
  enforceRateLimit,
  enforceRateLimitStrict,
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_UNAVAILABLE_MESSAGE,
} from '../rate-limit'

describe('rate limits', () => {
  beforeEach(() => {
    rpcMock.mockClear()
    rpcMock.mockResolvedValue({ data: true, error: null })
  })

  it('both variants allow when the counter is within the limit', async () => {
    await expect(enforceRateLimit('k', 3, 60)).resolves.toBeUndefined()
    await expect(enforceRateLimitStrict('k', 3, 60)).resolves.toBeUndefined()
  })

  it('both variants throw the rate-limit message when over the limit', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    await expect(enforceRateLimit('k', 3, 60)).rejects.toThrow(RATE_LIMIT_MESSAGE)
    await expect(enforceRateLimitStrict('k', 3, 60)).rejects.toThrow(RATE_LIMIT_MESSAGE)
  })

  it('on a DB error the base variant fails OPEN (availability)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    await expect(enforceRateLimit('k', 3, 60)).resolves.toBeUndefined()
  })

  it('on a DB error the strict variant fails CLOSED (mail-sending cap)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    await expect(enforceRateLimitStrict('k', 3, 60)).rejects.toThrow(RATE_LIMIT_UNAVAILABLE_MESSAGE)
  })
})
