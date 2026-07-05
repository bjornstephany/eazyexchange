'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Persists the organizer's school name from the /onboarding page. Mirrors
// createExchange's guards. Uses the cookie (RLS) client — the organizer
// updating their own school's name is the only client-permitted schools UPDATE.
export async function completeOnboarding(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')

  const name = ((formData.get('name') as string) ?? '').trim()
  if (!name) throw new Error('Veuillez renseigner le nom de votre établissement')

  const { error } = await supabase
    .from('schools').update({ name }).eq('id', profile.school_id)
  if (error) throw error

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
