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
  const email = (user.email ?? '').trim().toLowerCase()
  if (!fullName || !email) return { ok: false, reason: 'missing_metadata' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true, status: 'approved' }

  const { data: created, error: schoolError } = await admin
    .from('schools')
    .insert({ name: school.name, uai: school.uai, country: school.country })
    .select('id').single()
  if (schoolError || !created) {
    void sendSignupFailureEmail({ email, reason: 'school_insert_failed' })
    return { ok: false, reason: 'school_insert_failed' }
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
    void sendSignupFailureEmail({ email, reason: 'profile_insert_failed' })
    return { ok: false, reason: 'profile_insert_failed' }
  }

  const status = profile.status as 'pending' | 'approved'
  if (status === 'pending') {
    // Fire-and-forget: a notification failure must never fail the signup.
    void sendSignupRequestEmail({
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
async function resolveSchool(
  meta: Record<string, unknown> | undefined,
): Promise<{ name: string; uai: string | null; country: string } | null | 'unknown'> {
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

  return 'unknown'
}

// Email/password signup: full name and the picked school come from signup
// metadata. The school is claimed here (service role) rather than at
// /onboarding, because a pending organizer cannot reach /onboarding at all.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const school = await resolveSchool(user.user_metadata)
  if (school === 'unknown') return { ok: false, reason: 'unknown_school' }
  return createOrganizerAccount(user, fullName, school ?? { name: '', uai: null, country: 'FR' })
}

// Google signup: the identity carries only a name, so the school is deferred
// to /onboarding step 1 as before.
export async function provisionOrganizerFromOAuth(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  return createOrganizerAccount(user, fullName, { name: '', uai: null, country: 'FR' })
}
