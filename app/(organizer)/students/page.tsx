import { cookies } from 'next/headers'
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
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <h3 className="font-display text-2xl font-bold tracking-tight text-navy">
          Aucun élève confirmé pour cette session.
        </h3>
        <p className="text-muted-foreground">
          Les élèves apparaissent ici une fois leur candidature acceptée et leur compte créé.{' '}
          <Link href="/applications" className="font-semibold text-brand hover:underline">
            Voir les candidatures
          </Link>
        </p>
      </div>
    )
  }
  return <StudentsView exchangeId={active.id} students={students} />
}
