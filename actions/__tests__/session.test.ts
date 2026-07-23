import { describe, it, expect, vi, beforeEach } from 'vitest'

const set = vi.fn()
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

const requireOrganizer = vi.fn(async () => ({
  user: { id: 'org-1' },
  profile: { id: 'org-1', role: 'organizer' },
}))
vi.mock('@/lib/auth/require', () => ({ requireOrganizer: () => requireOrganizer() }))

type WriteResult = { error: { message: string } | null }
const eq = vi.fn(async (): Promise<WriteResult> => ({ error: null }))
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }))

import { setActiveExchange, setExchangeOrder } from '@/actions/session'
// The cap lives in lib/shell/exchange-order.ts, not beside the action: a
// 'use server' module may only export async functions.
import { EXCHANGE_ORDER_CAP } from '@/lib/shell/exchange-order'

// Valid v4-shaped uuids; only the shape matters to the action.
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'

describe('setActiveExchange', () => {
  beforeEach(() => {
    set.mockClear()
    revalidatePath.mockClear()
  })

  it('sets the active-exchange cookie with safe attributes', async () => {
    await setActiveExchange('ex-123')
    expect(set).toHaveBeenCalledWith(
      'ee_active_exchange',
      'ex-123',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

describe('setExchangeOrder', () => {
  beforeEach(() => {
    from.mockClear()
    update.mockClear()
    eq.mockClear()
    revalidatePath.mockClear()
    requireOrganizer.mockClear()
    eq.mockResolvedValue({ error: null })
    requireOrganizer.mockResolvedValue({
      user: { id: 'org-1' },
      profile: { id: 'org-1', role: 'organizer' },
    })
  })

  it('rejects a caller who is not an organizer', async () => {
    requireOrganizer.mockRejectedValueOnce(new Error('Unauthorized'))
    await expect(setExchangeOrder([U1])).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })

  it('writes the id list to the caller own row', async () => {
    const result = await setExchangeOrder([U1, U2])
    expect(from).toHaveBeenCalledWith('users')
    expect(update).toHaveBeenCalledWith({ exchange_order: [U1, U2] })
    expect(eq).toHaveBeenCalledWith('id', 'org-1')
    expect(result).toEqual({ ok: true })
  })

  it('dedupes, keeping the first occurrence', async () => {
    await setExchangeOrder([U2, U1, U2, U3, U1])
    expect(update).toHaveBeenCalledWith({ exchange_order: [U2, U1, U3] })
  })

  it('accepts an empty list (clears the personal order)', async () => {
    const result = await setExchangeOrder([])
    expect(update).toHaveBeenCalledWith({ exchange_order: [] })
    expect(result).toEqual({ ok: true })
  })

  it('returns a structured failure for a non-uuid id, without writing', async () => {
    const result = await setExchangeOrder([U1, 'not-a-uuid'])
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(update).not.toHaveBeenCalled()
  })

  it('returns a structured failure for a non-string entry, without writing', async () => {
    const result = await setExchangeOrder([U1, 42 as unknown as string])
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(update).not.toHaveBeenCalled()
  })

  it('returns a structured failure past the cap, without writing', async () => {
    const many = Array.from(
      { length: EXCHANGE_ORDER_CAP + 1 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`
    )
    const result = await setExchangeOrder(many)
    expect(result).toEqual({ ok: false, reason: 'too_many' })
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts exactly the cap', async () => {
    const many = Array.from(
      { length: EXCHANGE_ORDER_CAP },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`
    )
    expect(await setExchangeOrder(many)).toEqual({ ok: true })
  })

  it('returns a structured failure when the write errors', async () => {
    eq.mockResolvedValueOnce({ error: { message: 'boom' } })
    expect(await setExchangeOrder([U1])).toEqual({ ok: false, reason: 'write_failed' })
  })

  it('does not revalidate — the client already shows the new order', async () => {
    await setExchangeOrder([U1, U2])
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
