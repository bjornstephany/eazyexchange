import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq: updateEq }))

// Chainable query stub: users profile lookup + exchanges scope lookup + update
const from = vi.fn((table: string) => {
  if (table === 'users') {
    return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { school_id: 'school-1' } }) }) }) }
  }
  // exchanges
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }) }) }),
    update,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setExchangePhase } from '@/actions/exchanges'

describe('setExchangePhase', () => {
  beforeEach(() => { update.mockClear(); updateEq.mockClear() })

  it('updates the phase for an in-scope exchange', async () => {
    await setExchangePhase('ex-1', 2)
    expect(update).toHaveBeenCalledWith({ phase: 2 })
    expect(updateEq).toHaveBeenCalledWith('id', 'ex-1')
  })

  it('rejects an invalid phase value', async () => {
    // @ts-expect-error deliberately invalid
    await expect(setExchangePhase('ex-1', 3)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
})
