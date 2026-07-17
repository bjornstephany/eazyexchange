import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getTemplatesPage } from '@/actions/forms'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { FormsView } from '@/components/forms/FormsView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function FormsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { templates } = await getTemplatesPage(active.id, 'forms')
  return <FormsView exchangeId={active.id} templates={templates} />
}
