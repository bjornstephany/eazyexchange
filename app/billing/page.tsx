import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, isInGrace, PLAN_EXCHANGE_CAP } from '@/lib/billing/limits'
import { PLAN_LABEL_FR } from '@/lib/billing/display'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { PlanSelector } from '@/components/billing/PlanSelector'

export const dynamic = 'force-dynamic'

const capLabel = (n: number) => (n === Infinity ? 'illimités' : String(n))

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const unavailable = error === 'unavailable'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const { data: school } = await admin
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()

  const active = school ? hasActivePlan(school) : false
  const grace = school ? isInGrace(school) : false

  return (
    <CenteredCard maxWidth={640} className="flex flex-col gap-[22px]">
      {unavailable && (
        <p className="m-0 rounded-[11px] bg-[#FDECEA] px-4 py-3 text-sm text-[#C0392B]">
          Le paiement en ligne est momentanément indisponible. Merci de réessayer plus tard.
        </p>
      )}
      <div>
        <h3 className="m-0 mb-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">Offres &amp; facturation</h3>
        {active && school?.plan ? (
          <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">
            Vous êtes sur l’offre <span className="font-semibold text-[#10203F]">{PLAN_LABEL_FR[school.plan]}</span> ({capLabel(PLAN_EXCHANGE_CAP[school.plan])} échanges).
          </p>
        ) : (
          <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">Vous êtes en essai gratuit (1 échange). Choisissez une offre pour en créer davantage.</p>
        )}
      </div>

      {active && school?.plan ? (
        <div className="flex flex-col gap-4">
          {grace && <p className="m-0 text-sm text-[#C0392B]">Votre dernier paiement a échoué — mettez à jour votre carte pour conserver l’accès.</p>}
          <div className="flex gap-3">
            <Link href="/billing/portal" className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">Gérer la facturation</Link>
            <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">Retour au tableau de bord</Link>
          </div>
        </div>
      ) : (
        <>
          <PlanSelector />
          {school?.stripe_customer_id && (
            <Link href="/billing/portal" className="text-center text-sm font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">Gérer la facturation</Link>
          )}
        </>
      )}
    </CenteredCard>
  )
}
