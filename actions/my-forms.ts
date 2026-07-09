'use server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'

export async function getMyAssignments() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')

  const { data, error } = await supabase
    .from('assignments')
    .select(`
      id,
      assigned_at,
      form_templates!inner(id, name, type, deadline, exchanges!inner(name)),
      submissions(status, submitted_at, review_note)
    `)
    .eq('student_id', user.id)
    .order('assigned_at')

  if (error) throw error
  return data ?? []
}
