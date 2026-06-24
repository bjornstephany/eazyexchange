'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getExchanges() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const { data, error } = await supabase
    .from('exchanges')
    .select('*, school_a:schools!school_a_id(name), school_b:schools!school_b_id(name)')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as any[]
}

export async function createExchange(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const name = formData.get('name') as string
  const year = parseInt(formData.get('year') as string)
  const schoolBName = formData.get('school_b_name') as string

  // Check if school B already exists by name; create if not
  let schoolBId: string
  const { data: existing } = await supabase
    .from('schools')
    .select('id')
    .eq('name', schoolBName)
    .maybeSingle()

  if (existing) {
    schoolBId = existing.id
  } else {
    const { data: created, error: createError } = await supabase
      .from('schools')
      .insert({ name: schoolBName })
      .select('id')
      .single()
    if (createError) throw createError
    schoolBId = created.id
  }

  const { error } = await supabase.from('exchanges').insert({
    name,
    year,
    school_a_id: profile.school_id,
    school_b_id: schoolBId,
  })
  if (error) throw error
  revalidatePath('/dashboard')
}
