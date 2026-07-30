'use server'
import { createClient } from '@/lib/supabase/server'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { isSignupAllowlisted, recordWaitlistEntry } from '@/lib/auth/waitlist'

export type ResendSignupResult = { ok: true } | { ok: false; error: 'resend_failed' }

// Re-sends the signup confirmation email (carrying a fresh confirmation link).
// Relies on Supabase's own rate limits plus the client-side cooldown on the page.
//
// Confirmation itself is a one-click link in that email, verified by
// app/auth/confirm/route.ts (verifyOtp → provisionOrganizer → /onboarding).
// There is no in-tab code step. Expected failures are structured returns, never
// thrown, so prod Server Action error redaction cannot swallow them.
export async function resendSignupEmail(email: string): Promise<ResendSignupResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { ok: false, error: 'resend_failed' }
  return { ok: true }
}

export type RequestOrganizerSignupResult =
  | { ok: true; state: 'confirm' | 'waitlisted' }
  | {
      ok: false
      error: 'invalid_name' | 'invalid_email' | 'rate_limited' | 'signup_failed'
      message?: string
    }

// THE signup gate, application side. Eazyexchange is not open to the public, so
// only an address on signup_allowlist may become an account; everyone else has
// their address captured on signup_waitlist and gets no auth user, no school,
// no users row and no confirmation email.
//
// This runs on the server, not in the browser, on purpose. The page used to
// call supabase.auth.signUp() directly (page.tsx:48) — a client-side check
// cannot PREVENT an account from existing, and "no account at all" is the whole
// property this design buys. The cost is that the password transits our server,
// as it already does in actions/settings-password.ts; it is never logged.
//
// Every outcome is a structured return, never a throw: production redacts
// thrown Server Action messages behind an opaque digest, so a thrown validation
// error would reach the user as nothing at all.
export async function requestOrganizerSignup(input: {
  fullName: string
  email: string
  password: string
}): Promise<RequestOrganizerSignupResult> {
  // Same validation the client used to do, relocated. The server is now the
  // only place it happens, so a tampered client gains nothing.
  const fullName = input.fullName.trim()
  const email = normalizeEmail(input.email)
  if (!fullName) return { ok: false, error: 'invalid_name' }
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' }

  // Unauthenticated, and it writes to a table with no policies — cap it by
  // source IP on the same tier as the anonymous apply funnel. Fails CLOSED:
  // losing the cap here means unmetered account creation and unmetered mail
  // from our sending domain.
  const ip = await clientIp()
  const rate = await checkRateLimit(`signup:${ip}`, 10, 3600)
  if (rate === 'error') {
    console.error('[rate-limit] signup check failed, BLOCKING request')
    return { ok: false, error: 'rate_limited' }
  }
  if (rate === 'limited') return { ok: false, error: 'rate_limited' }

  if (!(await isSignupAllowlisted(email))) {
    await recordWaitlistEntry({ email, fullName, source: 'password' })
    return { ok: true, state: 'waitlisted' }
  }

  // Full name is all provisionOrganizer reads. The establishment is captured at
  // /onboarding step 1, where it is validated against school_registry.
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
    },
  })
  // Supabase's own message ("User already registered", password-strength
  // complaints) is the useful one and reaches the user intact — a RETURNED
  // string is not subject to prod's thrown-error redaction.
  if (error) return { ok: false, error: 'signup_failed', message: error.message }

  return { ok: true, state: 'confirm' }
}
