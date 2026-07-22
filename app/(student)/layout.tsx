import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages } from '@/lib/i18n/messages'
import { StudentTopBar } from '@/components/student/StudentTopBar'
import { StudentTabs } from '@/components/student/StudentTabs'
import { getStudentContext } from '@/actions/student-context'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (profile?.role !== 'student') redirect('/dashboard')

  const ctx = await getStudentContext()

  // resolveLocale() reads the same per-request cached profile fetched above, so
  // this adds no round-trip.
  const locale = await resolveLocale()
  const messages = await loadMessages(locale)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale} className="min-h-screen bg-background">
        <StudentTopBar initials={ctx.initials} exchangeLabel={ctx.exchangeLabel} locale={locale} />
        <StudentTabs />
        <main className="mx-auto max-w-[920px] px-7 pb-[70px] pt-[34px]">{children}</main>
      </div>
    </NextIntlClientProvider>
  )
}
