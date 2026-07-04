'use server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createBareClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'

type OrganizerCtx = { userId: string; schoolId: string; orgRole: 'owner' | 'admin'; email: string; fullName: string }

async function getOrganizerCtx(supabase: SupabaseClient): Promise<OrganizerCtx> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: profile } = await supabase
    .from('users').select('school_id, role, org_role, email, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return {
    userId: user.id, schoolId: profile.school_id,
    orgRole: (profile.org_role ?? 'admin') as 'owner' | 'admin',
    email: profile.email, fullName: profile.full_name,
  }
}

function assertOwner(ctx: OrganizerCtx): void {
  if (ctx.orgRole !== 'owner') throw new Error('Réservé au propriétaire du compte.')
}

export async function updateProfile(input: {
  fullName: string; phone: string; title: string; schoolName: string
}): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)

  const fullName = input.fullName.trim()
  const schoolName = input.schoolName.trim()
  if (!fullName) throw new Error('Le nom ne peut pas être vide.')
  if (!schoolName) throw new Error('Le nom de l’établissement ne peut pas être vide.')

  const { error: userError } = await supabase.from('users').update({
    full_name: fullName,
    phone: input.phone.trim() || null,
    title: input.title.trim() || null,
  }).eq('id', ctx.userId)
  if (userError) throw userError

  // schools.name is the only client-updatable school column (column grant
  // from 20260701000001) — RLS scopes the row to the caller's school.
  const { error: schoolError } = await supabase.from('schools')
    .update({ name: schoolName }).eq('id', ctx.schoolId)
  if (schoolError) throw schoolError

  revalidatePath('/settings')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const supabase = await createClient()
  const ctx = await getOrganizerCtx(supabase)
  await enforceRateLimit(`pwchange:${ctx.userId}`, 5, 3600)

  const policyError = passwordPolicyError(newPassword)
  if (policyError) throw new Error(policyError)

  // Verify the current password on a throwaway client so the session cookies
  // of THIS request are never touched.
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: signInError } = await bare.auth.signInWithPassword({
    email: ctx.email, password: currentPassword,
  })
  if (signInError) throw new Error('Mot de passe actuel incorrect.')

  if (await isPasswordPwned(newPassword)) throw new Error(PWNED_MESSAGE)

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error('Le mot de passe n’a pas pu être mis à jour. Réessayez.')
}

