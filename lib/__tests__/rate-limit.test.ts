import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn(async (_fn: string, _args: unknown) =>
  ({ data: true as boolean | null, error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (fn: string, args: unknown) => rpcMock(fn, args) }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import { checkRateLimit } from '../rate-limit'

// checkRateLimit only reports; it never throws and never decides. Each caller
// maps 'error' to fail-open or fail-closed itself — see actions/apply.ts
// (overRateLimit) for both, and note the throwing wrappers that used to live
// here are gone on purpose (they produced digests in production).
describe('checkRateLimit', () => {
  beforeEach(() => {
    rpcMock.mockClear()
    rpcMock.mockResolvedValue({ data: true, error: null })
  })

  it('passes the key, limit and window through to check_rate_limit', async () => {
    await checkRateLimit('apply_ip:1.2.3.4', 10, 3600)
    expect(rpcMock).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'apply_ip:1.2.3.4', p_limit: 10, p_window_seconds: 3600,
    })
  })

  it('reports allowed while the counter is within the limit', async () => {
    expect(await checkRateLimit('k', 3, 60)).toBe('allowed')
  })

  it('reports limited once the counter is over', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    expect(await checkRateLimit('k', 3, 60)).toBe('limited')
  })

  it('reports error on a DB failure, leaving the decision to the caller', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    expect(await checkRateLimit('k', 3, 60)).toBe('error')
  })

  it('treats a null result as allowed (only an explicit false is a refusal)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    expect(await checkRateLimit('k', 3, 60)).toBe('allowed')
  })

  it('never throws, whatever the RPC does', async () => {
    for (const outcome of [
      { data: false, error: null },
      { data: null, error: { code: 'XX000' } },
      { data: true, error: null },
    ]) {
      rpcMock.mockResolvedValue(outcome)
      await expect(checkRateLimit('k', 1, 1)).resolves.toBeTypeOf('string')
    }
  })
})
