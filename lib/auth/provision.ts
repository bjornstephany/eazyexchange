import { createAdminClient } from '@/lib/supabase/admin'

export interface ProvisionUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export type ProvisionResult = { ok: true } | { ok: false; reason: string }

function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

// Shared account-creation core. Idempotent; rolls back the school if the
// profile insert fails so a partial failure leaves no debris.
async function createOrganizerAccount(
  user: ProvisionUser,
  fullName: string,
  schoolName: string,
): Promise<ProvisionResult> {
  const email = (user.email ?? '').trim().toLowerCase()
  if (!fullName || !email) return { ok: false, reason: 'missing_metadata' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true }

  const { data: school, error: schoolError } = await admin
    .from('schools').insert({ name: schoolName }).select('id').single()
  if (schoolError || !school) return { ok: false, reason: 'school_insert_failed' }

  const { error: profileError } = await admin.from('users').insert({
    id: user.id,
    school_id: school.id,
    role: 'organizer' as const,
    org_role: 'owner' as const,
    full_name: fullName,
    email,
  })
  if (profileError) {
    await admin.from('schools').delete().eq('id', school.id)
    return { ok: false, reason: 'profile_insert_failed' }
  }

  return { ok: true }
}

// Email/password signup: full name comes from signup metadata; the school name
// is deferred (empty sentinel) and captured later on the /onboarding page —
// identical to the Google path.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  return createOrganizerAccount(user, fullName, '')
}

// Google signup: full name comes from the Google identity; the school name is
// deferred (empty sentinel), captured later on the first-exchange form.
export async function provisionOrganizerFromOAuth(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  return createOrganizerAccount(user, fullName, '')
}
