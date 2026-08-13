import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignupFailureEmail } from '@/lib/email'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'

export interface ProvisionUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export type ProvisionResult =
  | { ok: true; status: 'pending' | 'approved' }
  | { ok: false; reason: string }

function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

function normalizedEmail(user: ProvisionUser): string {
  return (user.email ?? '').trim().toLowerCase()
}

// Single exit for every provisioning failure, because none of them is visible
// otherwise: the user only ever sees a generic « Réessayez », and these are
// structured returns by design, so they never reach error_reports either.
//
// The email is awaited, not fire-and-forget. send() swallows its own errors and
// returns a boolean, so awaiting cannot fail a signup — whereas a `void` call is
// dropped when the serverless function freezes after the response, i.e. exactly
// when the alert matters. The log line carries the reason only, never the
// address.
async function failProvisioning(email: string, reason: string): Promise<ProvisionResult> {
  console.error(`[provision] failed: ${reason}`)
  if (email) await sendSignupFailureEmail({ email, reason })
  return { ok: false, reason }
}

// Creates the organizer account for every signup path — email/password and
// Google alike. Idempotent; rolls back the school if the profile insert fails
// so a partial failure leaves no debris.
//
// The school is always created blank, and now stays that way. /onboarding step
// 1 was the only thing that ever named it — via claim_school(), which
// re-validated the pick against school_registry — and it was removed on
// 2026-08-13, so claim_school() survives as an RPC with no caller. Signup asks
// for nothing but the name, and signup_allowlist (checked before this function
// is ever reached) is what keeps fake schools out.
//
// The initial status is NOT decided here — set_initial_user_status() decides
// it in the database so that join.ts, invitations.ts and the RLS fixtures are
// covered by the same rule. We read it back to pick the redirect.
// `locale`, when passed, is whatever the caller could read off the request
// (see lib/i18n/resolve.ts's resolveRequestLocale) — the organizer's own
// demonstrated language preference, same idea as the `language` invitations.ts
// seeds a student's profile with. Validated here rather than trusted, exactly
// like invitations.ts does for `claimed.language`: a bad or missing value
// degrades to DEFAULT_LOCALE rather than reaching the CHECK constraint.
export async function provisionOrganizer(
  user: ProvisionUser,
  locale?: string,
): Promise<ProvisionResult> {
  // `name` is Google's field; email/password signups only ever set `full_name`.
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  const email = normalizedEmail(user)
  if (!fullName || !email) return failProvisioning(email, 'missing_metadata')

  const seededLocale = isLocale(locale ?? '') ? locale : DEFAULT_LOCALE

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true, status: 'approved' }

  const { data: created, error: schoolError } = await admin
    .from('schools')
    .insert({ name: '', uai: null, country: 'FR' })
    .select('id').single()
  if (schoolError || !created) {
    return failProvisioning(email, 'school_insert_failed')
  }

  const { data: profile, error: profileError } = await admin.from('users').insert({
    id: user.id,
    school_id: created.id,
    role: 'organizer' as const,
    org_role: 'owner' as const,
    full_name: fullName,
    email,
    locale: seededLocale,
  }).select('status').single()

  if (profileError || !profile) {
    await admin.from('schools').delete().eq('id', created.id)
    return failProvisioning(email, 'profile_insert_failed')
  }

  const status = profile.status as 'pending' | 'approved'
  if (status === 'pending') {
    // Unreachable by design since the 2026-07-30 waitlist change: both signup
    // paths check signup_allowlist before an account can exist, and
    // set_initial_user_status() auto-approves an allowlisted address. Landing
    // here means those two disagreed — the account is stranded on /pending with
    // nobody watching, so it gets the same alert as a failed provision.
    await sendSignupFailureEmail({ email, reason: 'unexpected_pending_status' })
  }

  return { ok: true, status }
}
