import { describe, it, expect, vi, beforeEach } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))

import { setActiveExchange } from '@/actions/session'

describe('setActiveExchange', () => {
  beforeEach(() => set.mockClear())

  it('sets the active-exchange cookie with safe attributes', async () => {
    await setActiveExchange('ex-123')
    expect(set).toHaveBeenCalledWith(
      'ee_active_exchange',
      'ex-123',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
    )
  })
})
