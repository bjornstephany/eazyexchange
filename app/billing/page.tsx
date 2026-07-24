import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { hasActivePlan, isInGrace, exchangeCap, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
import { isPlanKey } from '@/lib/billing/plans'
import { usagePct } from '@/lib/billing/display'
import { planCopy } from '@/lib/billing/plan-copy'
import { asAppTranslator, loadMessages, pickNamespaces } from '@/lib/i18n/messages'
import { resolveLocale } from '@/lib/i18n/resolve'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { shellDestination, type ProfileRole } from '@/lib/auth/shell-destination'
import { PlanSelector } from '@/components/billing/PlanSelector'
import { UpgradeOptions } from '@/components/billing/UpgradeOptions'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>
}) {
  const { error, reason } = await searchParams
  const unavailable = error === 'unavailable'
  const blocked = reason === 'limit'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Own profile + own school: RLS covers both reads — no service role needed.
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') {
    redirect(shellDestination(profile?.role as ProfileRole | undefined, 'organizer')!)
  }

  const { data: school } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()

  // Same rule as getBillingOverview (actions/settings.ts): a school owns the
  // exchanges it created, where it is always school_a. Counting differently
  // here would let /billing and Settings disagree about the same number.
  const { count } = await supabase
    .from('exchanges').select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  const used = count ?? 0

  const grace = school ? isInGrace(school) : false
  const active = school ? hasActivePlan(school) : false
  const planKey = active && school && isPlanKey(school.plan) ? school.plan : null
  const cap = school ? exchangeCap(school) : TRIAL_EXCHANGE_CAP
  const atCap = used >= cap

  const locale = await resolveLocale()
  // /billing lives outside the (organizer) group, so it mounts its own provider
  // for the client-side PlanSelector. Only the namespaces this page needs.
  const messages = pickNamespaces(await loadMessages(locale), ['common', 'organizer'])
  const tRaw = await getTranslations('organizer.billing')
  const t = asAppTranslator(tRaw)

  const planLabel = planKey ? planCopy(t, planKey).label : ''
  const usageLabel = cap === Infinity ? t('usageUnlimited', { used }) : t('usage', { used, cap })

  // Urgency follows atCap, not the query param, so a bookmark or a Settings
  // click at 2/2 reads exactly like a blocked "+ Nouvel échange".
  const heading = grace
    ? t('grace.heading')
    : atCap
      ? (planKey ? t('capReached.heading', { plan: planLabel }) : t('trialCapReached.heading'))
      : t('heading')
  const lead = grace
    ? t('grace.body')
    : atCap
      ? (planKey ? t('capReached.body', { cap }) : t('trialCapReached.body'))
      : (planKey ? t('leadActive', { plan: planLabel }) : t('leadTrial'))

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>
        <CenteredCard maxWidth={planKey && !grace ? 720 : 640} className="flex flex-col gap-[22px]">
          {unavailable && (
            <p className="m-0 rounded-[11px] bg-[#FDECEA] px-4 py-3 text-sm text-[#C0392B]">
              {t('unavailable')}
            </p>
          )}

          <div>
            <h3 className="m-0 mb-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">{heading}</h3>
            {blocked && !grace && (
              <p className="m-0 mb-1.5 text-[15px] font-semibold leading-[1.55] text-[#10203F]">
                {t('capReached.blockedLead')}
              </p>
            )}
            <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">{lead}</p>
          </div>

          {school && (
            <div className="rounded-xl border border-[#C4CDE0] px-5 py-[18px]">
              {planKey && (
                <span className="rounded-full bg-[#EEF3FE] px-2.5 py-[3px] text-[11px] font-semibold text-[#2456E6]">
                  {t('currentPlanBadge')} · {planLabel}
                </span>
              )}
              <div className={`mb-[5px] h-1.5 overflow-hidden rounded-full bg-[#EEF1F7] ${planKey ? 'mt-3' : ''}`}>
                <div className="h-full rounded-full bg-[#2456E6]" style={{ width: `${usagePct(used, cap)}%` }} />
              </div>
              <div className="font-mono text-[11px] font-medium text-[#8A97B2]">{usageLabel}</div>
            </div>
          )}

          {grace ? (
            // Fix the card first, upgrade after: subscription_update_confirm
            // against a declining card is a poor flow, and asking for more money
            // mid-failure is the wrong ask.
            <div className="flex gap-3">
              <Link href="/billing/portal" className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">
                {t('grace.cta')}
              </Link>
              <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">
                {t('backToDashboard')}
              </Link>
            </div>
          ) : planKey ? (
            <>
              {/* Empty on `scale` — no special case needed for the top tier.
                  Awaited as a call rather than mounted as <UpgradeOptions />:
                  an async component ELEMENT can only be resolved by the RSC
                  renderer, which would leave this page untestable in jsdom. */}
              {await UpgradeOptions({ current: planKey })}
              <div className="flex items-center justify-center gap-5">
                <Link href="/billing/portal" className="text-sm font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
                  {t('managePortal')}
                </Link>
                <Link href="/dashboard" className="text-sm font-semibold text-[#5B6B8C] hover:text-[#10203F]">
                  {t('backToDashboard')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <PlanSelector />
              {school?.stripe_customer_id && (
                <Link href="/billing/portal" className="text-center text-sm font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
                  {t('managePortal')}
                </Link>
              )}
              <p className="m-0 text-center text-xs leading-[1.5] text-[#8A97B2]">
                {tRaw.rich('cgv', {
                  cgv: (chunks) => (
                    <Link href="/legal/cgv" className="font-medium text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </>
          )}
        </CenteredCard>
      </div>
    </NextIntlClientProvider>
  )
}
