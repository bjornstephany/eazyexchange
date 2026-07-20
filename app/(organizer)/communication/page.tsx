import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { getExchanges, getInfoCards } from '@/actions/exchanges'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { CommunicationView } from '@/components/communication/CommunicationView'

export const dynamic = 'force-dynamic'

export default async function CommunicationPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (profile?.role !== 'organizer') redirect('/login')

  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(
    exchanges.map((e: any) => ({ ...e, archived: !!e.archived_at })),
    cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value,
  )
  // Every sub-tab is active-exchange-scoped; without one, send them to the
  // dashboard (the rail tab itself only renders when an exchange is active).
  if (!active) redirect('/dashboard')

  const infoCards = await getInfoCards(active.id)

  return (
    <CommunicationView
      exchangeId={active.id}
      archived={active.archived}
      infoCards={infoCards}
    />
  )
}
