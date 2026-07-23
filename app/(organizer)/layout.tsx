import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getProfile } from '@/lib/supabase/request'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isInGrace, exchangeCap, hasActivePlan, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'
import { OrganizerShell, type ExchangeOption } from '@/components/shell/OrganizerShell'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { sortExchanges } from '@/lib/shell/exchange-order'
import { mustOnboard } from '@/lib/onboarding/gate'
import { NextIntlClientProvider } from 'next-intl'
import { resolveLocale } from '@/lib/i18n/resolve'
import { loadMessages } from '@/lib/i18n/messages'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const supabase = await createClient()

  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false

  const { data: exchangeRows } = await supabase
    .from('exchanges')
    .select('id, name, year, archived_at, school_a_id')
    .or(`school_a_id.eq.${profile.school_id},school_b_id.eq.${profile.school_id}`)
    .order('created_at', { ascending: false })
  const rows = (exchangeRows ?? []) as any[]
  // created_at desc from the query, then the organizer's personal drag order on
  // top of it. Exchanges the organizer has never dragged stay at the front, so
  // a brand new one is not buried under a hand-ordered list.
  const exchanges: ExchangeOption[] = sortExchanges(
    rows.map(e => ({
      id: e.id, name: e.name, year: e.year, archived: !!e.archived_at,
    })),
    profile.exchange_order ?? [],
  )

  // Count only exchanges this school owns (it is always school_a on ones it
  // created) to decide whether "+ Nouvel échange" should offer creation or
  // send the organizer to /billing.
  const ownedCount = rows.filter(e => e.school_a_id === profile.school_id).length

  // Hard gate: no organizer page renders until the school is named AND owns at
  // least one exchange. Catches fresh signups and existing empty accounts.
  // ownedCount includes archived exchanges, so archiving your only exchange
  // does not re-trap you here.
  if (school && mustOnboard(school.name, ownedCount)) redirect('/onboarding')

  const cap = school ? exchangeCap(school as never) : TRIAL_EXCHANGE_CAP
  const atCap = ownedCount >= cap
  // Feeds the informational banner in the "Nouvel échange" modal.
  const isTrial = school ? !hasActivePlan(school as never) : true
  const remaining = cap - ownedCount

  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)

  const locale = await resolveLocale()
  const messages = await loadMessages(locale)

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>
        <OrganizerShell
          exchanges={exchanges}
          activeExchangeId={active?.id ?? null}
          organizerName={profile.full_name}
          schoolName={school?.name ?? ''}
          atCap={atCap}
          isTrial={isTrial}
          remaining={remaining}
          orgRole={(profile.org_role ?? 'admin') as 'owner' | 'admin'}
        >
          {showGrace && <PaymentWarningBanner />}
          {children}
        </OrganizerShell>
      </div>
    </NextIntlClientProvider>
  )
}
