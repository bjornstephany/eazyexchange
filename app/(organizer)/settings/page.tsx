import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getExchanges } from '@/actions/exchanges'
import {
  getTeam, getBillingOverview, getProgramInfo,
  type BillingOverview, type ProgramInfo,
} from '@/actions/settings'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { SettingsView } from '@/components/settings/SettingsView'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, email, phone, title, org_role, schools(name)')
    .eq('id', user.id)
    .single<{ full_name: string; email: string; phone: string | null; title: string | null; org_role: string; schools: { name: string } | null }>()
  if (!profile) redirect('/login')

  const isOwner = profile.org_role === 'owner'
  const canChangePassword = (user.identities ?? []).some(i => i.provider === 'email')
  const team = await getTeam()

  let billing: BillingOverview | null = null
  let program: ProgramInfo | null = null
  if (isOwner) {
    billing = await getBillingOverview()
    const exchanges = await getExchanges()
    const cookieStore = await cookies()
    const active = resolveActiveExchange(
      exchanges.map((e: any) => ({ ...e, archived: !!e.archived_at })),
      cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value,
    )
    if (active) program = await getProgramInfo(active.id)
  }

  return (
    <SettingsView
      profile={{
        fullName: profile.full_name, email: profile.email,
        phone: profile.phone ?? '', title: profile.title ?? '',
        schoolName: profile.schools?.name ?? '',
      }}
      isOwner={isOwner}
      canChangePassword={canChangePassword}
      team={team}
      billing={billing}
      program={program}
    />
  )
}
