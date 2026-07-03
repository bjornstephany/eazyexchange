import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getTemplatesPage } from '@/actions/forms'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { DocsView } from '@/components/documents/DocsView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function DocumentsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { templates, studentCount, enrolledStudents } = await getTemplatesPage(active.id, 'docs')
  return (
    <DocsView exchangeId={active.id} templates={templates}
      studentCount={studentCount} enrolledStudents={enrolledStudents} />
  )
}
