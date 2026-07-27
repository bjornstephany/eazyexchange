import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const checkRateLimit = vi.fn(async () => 'allowed' as 'allowed' | 'limited' | 'error')
vi.mock('@/lib/rate-limit', () => ({
  clientIp: async () => 'ip',
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...(a as [])),
}))
const sendInvite = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/email', () => ({
  sendApplicationInviteEmail: (...a: unknown[]) => sendInvite(...a),
  sendGoodNewsEmail: vi.fn(async () => true), sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1', status: 'approved' }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))

// Admin client: exchange lookup, existing-rows lookup, upsert insert.
let exchange: any
let existingRows: any[]
let insertedRows: any[]
const upsert = vi.fn(() => ({ select: async () => ({ data: insertedRows, error: null }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_c?: string) => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: exchange, error: null }) }),
          in: async () => ({ data: existingRows, error: null }),
          maybeSingle: async () => ({ data: exchange, error: null }),
        }),
      }),
      upsert,
    }),
  }),
}))

import { sendApplicationInvitations } from '../applications-review'

beforeEach(() => {
  sendInvite.mockClear(); upsert.mockClear()
  checkRateLimit.mockResolvedValue('allowed')
  exchange = {
    id: 'ex1', name: 'X', school_a_id: 'school-1',
    application_open: true, application_deadline: '2999-01-01',
  }
  existingRows = []
  insertedRows = [{ email: 'new@x.co', resume_token: 'tok' }]
})

describe('sendApplicationInvitations', () => {
  it('creates rows for new emails and emails each one', async () => {
    const res = await sendApplicationInvitations('ex1', 'new@x.co')
    expect(res).toEqual({ ok: true, sent: 1, skippedExchange: 0, skippedElsewhere: 0, invalid: 0 })
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(sendInvite).toHaveBeenCalledTimes(1)
  })

  it('categorizes already-in-exchange, elsewhere, and invalid', async () => {
    existingRows = [{ email: 'here@x.co', exchange_id: 'ex1' }, { email: 'there@x.co', exchange_id: 'ex2' }]
    insertedRows = [{ email: 'new@x.co', resume_token: 'tok' }]
    const res = await sendApplicationInvitations('ex1', 'new@x.co, here@x.co, there@x.co, bad@')
    expect(res).toEqual({ ok: true, sent: 1, skippedExchange: 1, skippedElsewhere: 1, invalid: 1 })
  })

  it('refuses when applications are not open', async () => {
    exchange.application_open = false
    expect(await sendApplicationInvitations('ex1', 'a@x.co')).toEqual({ ok: false, notOpen: true })
  })

  it('refuses a foreign exchange', async () => {
    exchange.school_a_id = 'other'
    await expect(sendApplicationInvitations('ex1', 'a@x.co')).rejects.toThrow('Unauthorized')
  })
})
