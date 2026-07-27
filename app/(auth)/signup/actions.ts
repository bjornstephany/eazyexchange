'use server'
import { createClient } from '@/lib/supabase/server'

export type ResendSignupResult = { ok: true } | { ok: false; error: 'resend_failed' }

// Re-sends the signup confirmation email (carrying a fresh confirmation link).
// Relies on Supabase's own rate limits plus the client-side cooldown on the page.
//
// Confirmation itself is a one-click link in that email, verified by
// app/auth/confirm/route.ts (verifyOtp → provisionOrganizer → /onboarding or
// /pending). There is no in-tab code step. Expected failures are structured
// returns, never thrown, so prod Server Action error redaction cannot swallow them.
export async function resendSignupEmail(email: string): Promise<ResendSignupResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { ok: false, error: 'resend_failed' }
  return { ok: true }
}
