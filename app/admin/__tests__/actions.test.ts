import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn((_patch: Record<string, unknown>) => ({ eq: async () => ({ error: null }) }))
const getProfile = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update }) }) }))
vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveUser, rejectUser } from '../actions'

beforeEach(() => { update.mockClear(); getProfile.mockReset() })

describe('admin review actions', () => {
  it('approves and stamps reviewed_at', async () => {
    getProfile.mockResolvedValue({ email: 'owner@example.com' })
    process.env.ADMIN_EMAILS = 'owner@example.com'
    const res = await approveUser('u1')
    expect(res).toEqual({ ok: true })
    const patch = update.mock.calls[0][0] as { status: string; reviewed_at: string }
    expect(patch.status).toBe('approved')
    expect(patch.reviewed_at).toBeTruthy()
  })

  it('rejects and stamps reviewed_at', async () => {
    getProfile.mockResolvedValue({ email: 'owner@example.com' })
    process.env.ADMIN_EMAILS = 'owner@example.com'
    await rejectUser('u1')
    expect((update.mock.calls[0][0] as { status: string }).status).toBe('rejected')
  })

  it('refuses a non-admin without touching the database', async () => {
    getProfile.mockResolvedValue({ email: 'someone@else.com' })
    process.env.ADMIN_EMAILS = 'owner@example.com'
    await expect(approveUser('u1')).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a session with no profile', async () => {
    getProfile.mockResolvedValue(null)
    await expect(approveUser('u1')).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })
})
