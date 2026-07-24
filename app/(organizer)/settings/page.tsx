import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { getExchanges } from '@/actions/exchanges'
import {
  getTeam, getBillingOverview, getProgramInfo,
  type BillingOverview, type ProgramInfo,
} from '@/actions/settings'
import { getProgramDetails } from '@/actions/fillable'
import type { ExchangeProgramDetails } from '@/types/db'
import { getErasableSubjects } from '@/actions/retention'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { resolveLocale } from '@/lib/i18n/resolve'
import { SettingsView } from '@/components/settings/SettingsView'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (!profile) redirect('/login')

  const isOwner = profile.org_role === 'owner'
  const canChangePassword = (user.identities ?? []).some(i => i.provider === 'email')
  const team = await getTeam()
  const locale = await resolveLocale()

  let billing: BillingOverview | null = null
  if (isOwner) billing = await getBillingOverview()

  let program: ProgramInfo | null = null
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(
    exchanges.map((e: any) => ({ ...e, archived: !!e.archived_at })),
    cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value,
  )
  if (active) program = await getProgramInfo(active.id)

  let programDetails: ExchangeProgramDetails | null = null
  if (active) programDetails = await getProgramDetails(active.id)

  const subjects = await getErasableSubjects()

  return (
    <SettingsView
      profile={{
        fullName: profile.full_name, email: profile.email,
        schoolName: profile.schools?.name ?? '',
      }}
      isOwner={isOwner}
      schoolCountry={profile.schools?.country ?? 'FR'}
      canChangePassword={canChangePassword}
      team={team}
      billing={billing}
      program={program}
      programDetails={programDetails}
      locale={locale}
      subjects={subjects}
    />
  )
}
