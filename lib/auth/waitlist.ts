// lib/auth/waitlist.ts
// The signup gate, application side. ON THE ADMIN ALLOWLIST.
//
// signup_allowlist and signup_waitlist are both service-role only (no policies,
// no grants — see the migrations). They cannot be reached with a scoped RLS
// policy instead, because the caller on the password path is an anonymous
// visitor with no session at all: there is no auth.uid() to write a policy
// against. That is why this module is on the allowlist.
//
// Both helpers expect an ALREADY-NORMALIZED address (trimmed, lowercased) —
// both tables store lowercase, and set_initial_user_status() compares with
// lower(). Callers normalize once, at their edge.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWaitlistNotificationEmail } from '@/lib/email'

export type WaitlistSource = 'password' | 'google'

// Fails CLOSED. A transient lookup error means "not allowlisted", so the
// visitor lands on the waitlist — recoverable, and they can retry. Failing open
// would create the account this whole design exists to prevent.
export async function isSignupAllowlisted(email: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('signup_allowlist')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (error) {
    // Never the address: this runs on an anonymous path with a stranger's email.
    console.error('[waitlist] allowlist lookup failed')
    return false
  }
  return !!data
}

// Idempotent: ON CONFLICT (email) DO NOTHING, so a second signup preserves the
// original created_at and shows the same message. Never throws — the caller has
// already decided what the visitor sees, and a failed insert must not turn a
// waitlist message into an error screen.
export async function recordWaitlistEntry(entry: {
  email: string
  fullName: string | null
  source: WaitlistSource
}): Promise<void> {
  const admin = createAdminClient()

  // ignoreDuplicates maps to ON CONFLICT DO NOTHING; with .select() a conflict
  // comes back as an empty array. That is how the notification stays
  // first-time-only without a second round-trip.
  const { data, error } = await admin
    .from('signup_waitlist')
    .upsert(
      { email: entry.email, full_name: entry.fullName, source: entry.source },
      { onConflict: 'email', ignoreDuplicates: true },
    )
    .select()

  if (error) {
    console.error('[waitlist] insert failed')
    return
  }
  if ((data ?? []).length === 0) return

  // Awaited, not fire-and-forget: a `void` call is dropped when the serverless
  // function freezes after the response — exactly when the alert matters.
  await sendWaitlistNotificationEmail({
    fullName: entry.fullName ?? '',
    email: entry.email,
    source: entry.source,
  })
}
