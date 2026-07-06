import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isInGrace, exchangeCap, hasActivePlan, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'
import { OrganizerShell, type ExchangeOption } from '@/components/shell/OrganizerShell'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const supabase = await createClient()

  const school = profile?.schools ?? null
  // Hard gate: no organizer page renders with an empty school name. A fresh
  // organizer (email/password or Google) lands here and is sent to onboarding.
  if (school && school.name === '') redirect('/onboarding')
  const showGrace = school ? isInGrace(school as never) : false

  const { data: exchangeRows } = await supabase
    .from('exchanges')
    .select('id, name, year, phase, archived_at, school_a_id')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })
  const rows = (exchangeRows ?? []) as any[]
  const exchanges: ExchangeOption[] = rows.map(e => ({
    id: e.id, name: e.name, year: e.year, phase: e.phase, archived: !!e.archived_at,
  }))

  // Count only exchanges this school owns (it is always school_a on ones it
  // created) to decide whether "+ Nouvel échange" should offer creation or
  // send the organizer to /billing.
  const ownedCount = rows.filter(e => e.school_a_id === profile.school_id).length
  const cap = school ? exchangeCap(school as never) : TRIAL_EXCHANGE_CAP
  const atCap = ownedCount >= cap
  // Feeds the informational banner in the "Nouvel échange" modal.
  const isTrial = school ? !hasActivePlan(school as never) : true
  const remaining = cap - ownedCount

  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)

  return (
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId={active?.id ?? null}
      organizerName={profile.full_name}
      schoolName={school?.name ?? ''}
      atCap={atCap}
      isTrial={isTrial}
      remaining={remaining}
    >
      {showGrace && <PaymentWarningBanner />}
      {children}
    </OrganizerShell>
  )
}
