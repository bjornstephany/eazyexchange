import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getTemplatesPage } from '@/actions/forms'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { FichiersView } from '@/components/forms/FichiersView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function FormsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { templates, enrolledStudents, programDetails } = await getTemplatesPage(active.id)
  return (
    <FichiersView exchangeId={active.id} templates={templates}
      enrolledStudents={enrolledStudents} programDetails={programDetails} />
  )
}
