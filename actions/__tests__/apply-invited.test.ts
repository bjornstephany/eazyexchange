import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
}))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))
vi.mock('@/lib/rate-limit', () => ({
  clientIp: async () => '1.2.3.4',
  enforceRateLimit: vi.fn(async () => {}),
  enforceRateLimitStrict: vi.fn(async () => {}),
}))

let appRow: any
const update = vi.fn(() => ({ eq: async () => ({ error: null }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: appRow, error: null }) }) }),
      update,
    }),
  }),
}))

import { saveApplicationDraft } from '../apply'

beforeEach(() => {
  update.mockClear()
  appRow = {
    id: 'a1', status: 'invited', resume_token_expires_at: new Date(Date.now() + 1e9).toISOString(),
    exchange_id: 'ex1', email: 'x@y.co', photo_path: null, school_id: 's1',
  }
})

describe('apply funnel: invited rows are editable drafts', () => {
  it('saving an invited draft flips it to draft', async () => {
    const res = await saveApplicationDraft('tok', { first_name: 'Léo' })
    expect(res).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ data: { first_name: 'Léo' }, status: 'draft' })
  })

  it('saving an already-draft row does not re-set status', async () => {
    appRow.status = 'draft'
    await saveApplicationDraft('tok', { first_name: 'Léo' })
    expect(update).toHaveBeenCalledWith({ data: { first_name: 'Léo' } })
  })
})
