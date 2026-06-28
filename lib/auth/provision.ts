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

// Idempotently create the school + organizer profile for a freshly confirmed
// signup. Uses the service-role admin client (bypasses RLS), mirroring
// actions/students.ts. Nothing is written until the email is confirmed, so
// abandoned signups leave no rows.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const schoolName = metaString(user.user_metadata, 'school_name')
  const email = (user.email ?? '').trim().toLowerCase()
  if (!fullName || !schoolName || !email) return { ok: false, reason: 'missing_metadata' }

  const admin = createAdminClient()

  // Idempotent: if a profile already exists, do nothing (double-clicked link, retry).
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
    full_name: fullName,
    email,
  })
  if (profileError) {
    // Roll back the orphan school so a failed profile insert leaves no debris.
    await admin.from('schools').delete().eq('id', school.id)
    return { ok: false, reason: 'profile_insert_failed' }
  }

  return { ok: true }
}
