import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getExchanges } from '@/actions/exchanges'
import { getStudentsDirectory } from '@/actions/students'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { StudentsView } from '@/components/students/StudentsView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import Link from 'next/link'

export default async function StudentsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { students } = await getStudentsDirectory(active.id)

  if (students.length === 0) {
    const t = await getTranslations('organizer')
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <h3 className="font-display text-2xl font-bold tracking-tight text-navy">
          {t('pages.students.emptyHeading')}
        </h3>
        <p className="text-muted-foreground">
          {t('pages.students.emptyBodyPrefix')}{' '}
          <Link href="/applications" className="font-semibold text-brand hover:underline">
            {t('pages.students.emptyBodyLink')}
          </Link>
        </p>
      </div>
    )
  }
  return <StudentsView exchangeId={active.id} students={students} />
}
