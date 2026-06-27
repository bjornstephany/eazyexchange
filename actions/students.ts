'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function inviteStudent(exchangeId: string, email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')

  // The organizer may only invite into an exchange their school participates in
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('school_a_id, school_b_id')
    .eq('id', exchangeId)
    .maybeSingle()
  if (!exchange) throw new Error('Exchange not found')
  if (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id) {
    throw new Error('Unauthorized')
  }

  const admin = createAdminClient()

  // Send Supabase invite email. The invite email template must point at the
  // token_hash verification handler so the SSR cookie flow works, e.g.:
  //   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite
  // `redirectTo` sets {{ .RedirectTo }} / the allowlisted target; the user lands
  // on /accept-invite after /auth/confirm establishes their session.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite`,
  })
  if (inviteError) {
    if (inviteError.code === 'email_exists') {
      throw new Error('A user with this email is already registered')
    }
    throw inviteError
  }

  // Pre-create the profile row. Use insert (not upsert) so we never overwrite an
  // existing user's profile — that would let an organizer hijack another account
  // by re-pointing its school_id/role. A conflict means the email is already in use.
  const { error: profileError } = await admin.from('users').insert({
    id: invited.user.id,
    school_id: profile.school_id,
    role: 'student' as const,
    email,
    full_name: '',
  })
  if (profileError) {
    if (profileError.code === '23505') throw new Error('A user with this email is already registered')
    throw profileError
  }

  // Enroll in exchange. The trg_assign_on_enrollment_insert trigger fans out
  // assignments for all existing same-school templates in this exchange, so no
  // application-side assignment is needed here.
  const { error: enrollError } = await supabase.from('exchange_enrollments').insert({
    exchange_id: exchangeId,
    user_id: invited.user.id,
  })
  // Ignore duplicate enrollment
  if (enrollError && enrollError.code !== '23505') throw enrollError

  revalidatePath(`/exchanges/${exchangeId}/students`)
}

export async function getExchangeStudents(exchangeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  // Only return students for an exchange this organizer's school participates in
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('school_a_id, school_b_id')
    .eq('id', exchangeId)
    .maybeSingle()
  if (!exchange) throw new Error('Exchange not found')
  if (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id) {
    throw new Error('Unauthorized')
  }

  const { data: enrollments } = await supabase
    .from('exchange_enrollments')
    .select('user_id')
    .eq('exchange_id', exchangeId)

  const enrolledIds = (enrollments ?? []).map(e => e.user_id)
  if (enrolledIds.length === 0) return []

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', enrolledIds)
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .order('full_name')

  if (error) throw error
  return data ?? []
}
