'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { provisionOrganizer } from '@/lib/auth/provision'

export type ConfirmSignupResult = {
  ok: false
  error: 'invalid_code' | 'expired' | 'provision_failed'
}
export type ResendSignupResult = { ok: true } | { ok: false; error: 'resend_failed' }

// Confirms the 6-digit signup code IN the original tab. verifyOtp writes the
// session cookies to the SSR cookie store (exactly as app/auth/confirm/route.ts
// does), we provision the organizer (idempotent), then redirect() so the cookie
// writes flush onto the response — a returned value would not flush the session.
// Expected failures are structured returns, never thrown, so prod Server Action
// error redaction cannot swallow them.
//
// Implementation note: `type: 'signup'` is the documented type for a signup
// confirmation OTP. If the live project rejects it for a plain 6-digit token,
// fall back to `type: 'email'` (verify against prod during manual verification).
export async function confirmSignupCode(email: string, code: string): Promise<ConfirmSignupResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
  if (error || !data.user) {
    const expired = error?.code === 'otp_expired' || /expire/i.test(error?.message ?? '')
    return { ok: false, error: expired ? 'expired' : 'invalid_code' }
  }
  const result = await provisionOrganizer(data.user)
  if (!result.ok) return { ok: false, error: 'provision_failed' }
  // Straight into onboarding. Routing a fresh signup through /dashboard only to
  // be bounced adds a redirect that can only fail: if the layout gate does not
  // fire, /dashboard renders for a user with no school. A self-signup lands
  // pending and cannot reach /onboarding at all, so it goes to /pending.
  redirect(result.status === 'approved' ? '/onboarding' : '/pending')
}

// Re-sends the signup confirmation email (carrying a fresh code). Relies on
// Supabase's own rate limits plus the client-side cooldown on the page.
export async function resendSignupCode(email: string): Promise<ResendSignupResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { ok: false, error: 'resend_failed' }
  return { ok: true }
}
