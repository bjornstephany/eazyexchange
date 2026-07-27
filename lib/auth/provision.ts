import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignupRequestEmail, sendSignupFailureEmail } from '@/lib/email'

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

// Shared account-creation core. Idempotent; rolls back the school if the
// profile insert fails so a partial failure leaves no debris.
//
// The initial status is NOT decided here — set_initial_user_status() decides
// it in the database so that join.ts, invitations.ts and the RLS fixtures are
// covered by the same rule. We read it back to pick the redirect.
async function createOrganizerAccount(
  user: ProvisionUser,
  fullName: string,
  school: { name: string; uai: string | null; country: string },
): Promise<ProvisionResult> {
  const email = normalizedEmail(user)
  if (!fullName || !email) return failProvisioning(email, 'missing_metadata')

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true, status: 'approved' }

  const { data: created, error: schoolError } = await admin
    .from('schools')
    .insert({ name: school.name, uai: school.uai, country: school.country })
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
    role_description: metaString(user.user_metadata, 'role_description') || null,
    how_found_us: metaString(user.user_metadata, 'how_found_us') || null,
  }).select('status').single()

  if (profileError || !profile) {
    await admin.from('schools').delete().eq('id', created.id)
    return failProvisioning(email, 'profile_insert_failed')
  }

  const status = profile.status as 'pending' | 'approved'
  if (status === 'pending') {
    // Awaited for the same reason as the failure alert: send() cannot throw, and
    // a dropped notification means an organizer waits on /pending that nobody
    // knows about.
    await sendSignupRequestEmail({
      fullName,
      email,
      schoolLabel: school.name || '—',
      roleDescription: metaString(user.user_metadata, 'role_description') || '—',
      howFoundUs: metaString(user.user_metadata, 'how_found_us') || '—',
      viaGoogle: !school.uai && !school.name,
    })
  }

  return { ok: true, status }
}

// Resolve the school the signup form picked, re-validating it against the
// registry rather than trusting the client — same precedence claim_school()
// uses: exact (uai, name) pair first, then the lowest id for that UAI.
// Returns null when nothing was picked (the Google path), which provisions a
// blank school so /onboarding step 1 can capture it after approval.
//
// 'unknown' and 'lookup_failed' are deliberately separate. Reading only `.data`
// collapsed them, and on 2026-07-27 a stale service-role key 401'd both probes:
// a total outage was reported as "we don't know that school", the one outcome
// that looked like the user's fault and sent no alert.
async function resolveSchool(
  meta: Record<string, unknown> | undefined,
): Promise<{ name: string; uai: string | null; country: string } | null | 'unknown' | 'lookup_failed'> {
  const uai = metaString(meta, 'school_uai')
  const country = metaString(meta, 'school_country') || 'FR'
  if (!uai) return null

  const admin = createAdminClient()
  const pickedName = metaString(meta, 'school_name')
  const exact = await admin
    .from('school_registry').select('uai, name')
    .eq('uai', uai).eq('name', pickedName)
    .order('id').limit(1).maybeSingle()
  if (exact.data) return { name: exact.data.name, uai: exact.data.uai, country }

  const byUai = await admin
    .from('school_registry').select('uai, name')
    .eq('uai', uai)
    .order('id').limit(1).maybeSingle()
  if (byUai.data) return { name: byUai.data.name, uai: byUai.data.uai, country }

  // Only a clean miss on both probes means the registry genuinely lacks the UAI.
  if (exact.error || byUai.error) return 'lookup_failed'
  return 'unknown'
}

// Email/password signup: full name and the picked school come from signup
// metadata. The school is claimed here (service role) rather than at
// /onboarding, because a pending organizer cannot reach /onboarding at all.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const school = await resolveSchool(user.user_metadata)
  if (school === 'unknown' || school === 'lookup_failed') {
    return failProvisioning(
      normalizedEmail(user),
      school === 'unknown' ? 'unknown_school' : 'school_lookup_failed',
    )
  }
  return createOrganizerAccount(user, fullName, school ?? { name: '', uai: null, country: 'FR' })
}

// Google signup: the identity carries only a name, so the school is deferred
// to /onboarding step 1 as before.
export async function provisionOrganizerFromOAuth(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  return createOrganizerAccount(user, fullName, { name: '', uai: null, country: 'FR' })
}
