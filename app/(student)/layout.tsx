import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StudentTopBar } from '@/components/student/StudentTopBar'
import { getStudentContext } from '@/actions/student-context'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') redirect('/dashboard')

  const ctx = await getStudentContext()

  return (
    <div className="min-h-screen bg-background">
      <StudentTopBar initials={ctx.initials} exchangeLabel={ctx.exchangeLabel} />
      <main className="mx-auto max-w-[920px] px-7 pb-[70px] pt-[34px]">{children}</main>
    </div>
  )
}
