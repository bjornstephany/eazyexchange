import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

let verifyResult: { data: { user: unknown }; error: { message?: string; code?: string } | null }
let resendResult: { error: { message?: string } | null }
const verifyOtp = vi.fn(async () => verifyResult)
const resend = vi.fn(async () => resendResult)
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp, resend } }),
}))

const provisionOrganizer = vi.fn(
  async (_u: unknown) => ({ ok: true, status: 'pending' }) as { ok: boolean; status?: string; reason?: string },
)
vi.mock('@/lib/auth/provision', () => ({ provisionOrganizer: (u: unknown) => provisionOrganizer(u) }))

import { confirmSignupCode, resendSignupCode } from '@/app/(auth)/signup/actions'

async function catchRedirect(fn: () => Promise<unknown>): Promise<string> {
  try { await fn() } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

beforeEach(() => {
  redirect.mockClear(); provisionOrganizer.mockClear(); verifyOtp.mockClear(); resend.mockClear()
  verifyResult = { data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } }, error: null }
  resendResult = { error: null }
})

describe('confirmSignupCode', () => {
  // A self-signup lands pending behind the approval gate, and /onboarding would
  // bounce it straight back — so the holding page is the destination.
  it('verifies the code, provisions, and redirects a pending signup to /pending', async () => {
    const dest = await catchRedirect(() => confirmSignupCode('a@b.com', '123456'))
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'signup' })
    expect(provisionOrganizer).toHaveBeenCalledTimes(1)
    expect(dest).toBe('/pending')
  })

  it('sends a pre-approved (allowlisted) signup to /onboarding', async () => {
    provisionOrganizer.mockResolvedValueOnce({ ok: true, status: 'approved' })
    const dest = await catchRedirect(() => confirmSignupCode('a@b.com', '123456'))
    // Not /dashboard: a fresh signup has no school, so routing it through a page
    // the layout gate is guaranteed to bounce adds a hop that can only fail.
    expect(dest).toBe('/onboarding')
  })

  it('returns invalid_code and does not provision on a bad code', async () => {
    verifyResult = { data: { user: null }, error: { message: 'Token has invalid format' } }
    const res = await confirmSignupCode('a@b.com', '000000')
    expect(res).toEqual({ ok: false, error: 'invalid_code' })
    expect(provisionOrganizer).not.toHaveBeenCalled()
  })

  it('returns expired when the code has expired', async () => {
    verifyResult = { data: { user: null }, error: { message: 'Token has expired', code: 'otp_expired' } }
    const res = await confirmSignupCode('a@b.com', '000000')
    expect(res).toEqual({ ok: false, error: 'expired' })
  })

  it('returns provision_failed when provisioning fails', async () => {
    provisionOrganizer.mockResolvedValueOnce({ ok: false, reason: 'profile_insert_failed' })
    const res = await confirmSignupCode('a@b.com', '123456')
    expect(res).toEqual({ ok: false, error: 'provision_failed' })
  })
})

describe('resendSignupCode', () => {
  it('resends the signup code', async () => {
    const res = await resendSignupCode('a@b.com')
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' })
    expect(res).toEqual({ ok: true })
  })

  it('returns resend_failed on error', async () => {
    resendResult = { error: { message: 'rate limited' } }
    const res = await resendSignupCode('a@b.com')
    expect(res).toEqual({ ok: false, error: 'resend_failed' })
  })
})
