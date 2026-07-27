import { describe, it, expect, vi, beforeEach } from 'vitest'

let resendResult: { error: { message?: string } | null }
const resend = vi.fn(async () => resendResult)
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { resend } }),
}))

import { resendSignupEmail } from '@/app/(auth)/signup/actions'

beforeEach(() => {
  resend.mockClear()
  resendResult = { error: null }
})

// Signup confirmation itself is the one-click link in the email, verified by
// app/auth/confirm/route.ts (covered in app/__tests__/confirm.test.ts). The only
// server action left on this page is the resend.
describe('resendSignupEmail', () => {
  it('resends the signup confirmation email', async () => {
    const res = await resendSignupEmail('a@b.com')
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' })
    expect(res).toEqual({ ok: true })
  })

  it('returns resend_failed on error', async () => {
    resendResult = { error: { message: 'rate limited' } }
    const res = await resendSignupEmail('a@b.com')
    expect(res).toEqual({ ok: false, error: 'resend_failed' })
  })
})
