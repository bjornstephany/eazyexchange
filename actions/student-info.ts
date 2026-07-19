'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/require'

export type StudentInfoCard = { id: string; title: string; body: string; exchangeName: string }

export async function getStudentInfoCards(): Promise<StudentInfoCard[]> {
  const supabase = await createClient()
  await requireUser()

  // RLS restricts SELECT to cards of exchanges the student is enrolled in.
  // The inner join pulls the exchange name for grouping in the view.
  const { data, error } = await supabase
    .from('exchange_info_cards')
    .select('id, title, body, position, exchanges!inner(name)')
    .order('position', { ascending: true })
    .returns<{ id: string; title: string; body: string; position: number; exchanges: { name: string } }[]>()
  if (error) throw error

  return (data ?? [])
    .map(r => ({ id: r.id, title: r.title, body: r.body, exchangeName: r.exchanges.name }))
    .sort((a, b) => a.exchangeName.localeCompare(b.exchangeName))
}
