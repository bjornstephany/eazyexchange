import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StudentNav } from '@/components/StudentNav'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-50">
      <StudentNav />
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
