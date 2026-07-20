import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { StudentTopBar } from '@/components/student/StudentTopBar'
import { StudentTabs } from '@/components/student/StudentTabs'
import { getStudentContext } from '@/actions/student-context'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (profile?.role !== 'student') redirect('/dashboard')

  const ctx = await getStudentContext()

  return (
    <div className="min-h-screen bg-background">
      <StudentTopBar initials={ctx.initials} exchangeLabel={ctx.exchangeLabel} />
      <StudentTabs />
      <main className="mx-auto max-w-[920px] px-7 pb-[70px] pt-[34px]">{children}</main>
    </div>
  )
}
