'use server'
import { createClient } from '@/lib/supabase/server'
import { deriveName } from '@/lib/student/dossier'

export interface StudentContext {
  fullName: string
  firstName: string
  initials: string
  exchangeLabel: string | null
}

export async function getStudentContext(): Promise<StudentContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  // Self read only — no PII logged.
  const { data: profile } = await supabase
    .from('users').select('full_name').eq('id', user.id).single<{ full_name: string }>()
  const fullName = profile?.full_name ?? ''
  const { firstName, initials } = deriveName(fullName)

  // Session label = the student's exchange (single-exchange is the MVP norm).
  // Read-only, self-scoped; degrade to null if unreadable/absent so the bar
  // still renders.
  const { data: enrollment } = await supabase
    .from('exchange_enrollments')
    .select('exchanges(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ exchanges: { name: string } | null }>()

  return { fullName, firstName, initials, exchangeLabel: enrollment?.exchanges?.name ?? null }
}
