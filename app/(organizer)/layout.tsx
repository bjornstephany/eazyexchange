import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isInGrace } from '@/lib/billing/limits'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'
import { OrganizerShell, type ExchangeOption } from '@/components/shell/OrganizerShell'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name, school_id, schools(name, subscription_status, plan, grace_until)')
    .eq('id', user.id)
    .single<{
      role: string
      full_name: string
      school_id: string
      schools: {
        name: string
        subscription_status: string | null
        plan: string | null
        grace_until: string | null
      } | null
    }>()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false

  const { data: exchangeRows } = await supabase
    .from('exchanges')
    .select('id, name, year')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })
  const exchanges: ExchangeOption[] = exchangeRows ?? []

  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)

  return (
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId={active?.id ?? null}
      organizerName={profile.full_name}
      needsSchoolName={school?.name === ''}
    >
      {showGrace && <PaymentWarningBanner />}
      {children}
    </OrganizerShell>
  )
}
