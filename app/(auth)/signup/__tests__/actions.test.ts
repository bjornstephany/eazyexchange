import { describe, it, expect, vi, beforeEach } from 'vitest'

type SignUpArg = {
  email: string
  password: string
  options: { data: Record<string, string>; emailRedirectTo: string }
}

let resendResult: { error: { message?: string } | null }
let signUpResult: { error: { message: string } | null }
const resend = vi.fn(async () => resendResult)
const signUp = vi.fn(async (_arg: SignUpArg) => signUpResult)
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { resend, signUp } }),
}))

let allowlisted = false
const isSignupAllowlisted = vi.fn(async (_email: string) => allowlisted)
const recordWaitlistEntry = vi.fn(async (_e: Record<string, unknown>) => {})
vi.mock('@/lib/auth/waitlist', () => ({
  isSignupAllowlisted: (e: string) => isSignupAllowlisted(e),
  recordWaitlistEntry: (e: Record<string, unknown>) => recordWaitlistEntry(e),
}))

let rateOutcome: 'allowed' | 'limited' | 'error' = 'allowed'
const checkRateLimit = vi.fn(async (_k: string, _l: number, _w: number) => rateOutcome)
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (k: string, l: number, w: number) => checkRateLimit(k, l, w),
  clientIp: async () => '203.0.113.9',
}))

import { resendSignupEmail, requestOrganizerSignup } from '@/app/(auth)/signup/actions'

beforeEach(() => {
  resend.mockClear()
  signUp.mockClear()
  isSignupAllowlisted.mockClear()
  recordWaitlistEntry.mockClear()
  checkRateLimit.mockClear()
  resendResult = { error: null }
  signUpResult = { error: null }
  allowlisted = false
  rateOutcome = 'allowed'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

// Signup confirmation itself is the one-click link in the email, verified by
// app/auth/confirm/route.ts (covered in app/__tests__/confirm.test.ts).
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

describe('requestOrganizerSignup', () => {
  const input = { fullName: 'Jane Doe', email: 'jane@example.com', password: 'supersecret' }

  it('creates the account for an allowlisted address', async () => {
    allowlisted = true
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: true, state: 'confirm' })
    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.password).toBe('supersecret')
    // toEqual, not toMatchObject: a leftover key would mean provisionOrganizer
    // is still being fed data nothing reads.
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(arg.options.emailRedirectTo).toBe('https://app.test/onboarding')
    expect(recordWaitlistEntry).not.toHaveBeenCalled()
  })

  // The property the whole design rests on: no auth user, no school, no users
  // row, no confirmation email for a stranger.
  it('waitlists a non-allowlisted address and never calls signUp', async () => {
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: true, state: 'waitlisted' })
    expect(signUp).not.toHaveBeenCalled()
    expect(recordWaitlistEntry).toHaveBeenCalledWith({
      email: 'jane@example.com', fullName: 'Jane Doe', source: 'password',
    })
  })

  it('is idempotent: a second attempt still reports waitlisted', async () => {
    await requestOrganizerSignup(input)
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: true, state: 'waitlisted' })
    expect(recordWaitlistEntry).toHaveBeenCalledTimes(2)
  })

  it('normalizes case and whitespace before consulting the allowlist', async () => {
    allowlisted = true
    await requestOrganizerSignup({ ...input, email: '  Jane@Example.COM  ', fullName: '  Jane Doe  ' })
    expect(isSignupAllowlisted).toHaveBeenCalledWith('jane@example.com')
    expect(signUp.mock.calls[0][0].email).toBe('jane@example.com')
    expect(signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Jane Doe' })
  })

  it('rejects an empty name without touching the allowlist', async () => {
    const res = await requestOrganizerSignup({ ...input, fullName: '   ' })
    expect(res).toEqual({ ok: false, error: 'invalid_name' })
    expect(isSignupAllowlisted).not.toHaveBeenCalled()
  })

  it('rejects a malformed address without touching the allowlist', async () => {
    const res = await requestOrganizerSignup({ ...input, email: 'a@b' })
    expect(res).toEqual({ ok: false, error: 'invalid_email' })
    expect(isSignupAllowlisted).not.toHaveBeenCalled()
  })

  it('caps attempts per source IP', async () => {
    rateOutcome = 'limited'
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: false, error: 'rate_limited' })
    expect(checkRateLimit).toHaveBeenCalledWith('signup:203.0.113.9', 10, 3600)
    expect(signUp).not.toHaveBeenCalled()
    expect(recordWaitlistEntry).not.toHaveBeenCalled()
  })

  // Fails CLOSED: this fronts an unauthenticated write to a zero-policy table
  // and a Supabase account creation. Losing the cap is worse than a refusal.
  it('refuses when the rate-limit check itself errors', async () => {
    rateOutcome = 'error'
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: false, error: 'rate_limited' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('passes a Supabase signUp failure back as a structured result', async () => {
    allowlisted = true
    signUpResult = { error: { message: 'User already registered' } }
    const res = await requestOrganizerSignup(input)
    expect(res).toEqual({ ok: false, error: 'signup_failed', message: 'User already registered' })
  })
})
