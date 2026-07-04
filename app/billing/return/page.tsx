import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan } from '@/lib/billing/limits'
import { Logo } from '@/components/brand/Logo'
import { ReturnPoller } from './ReturnPoller'

export const dynamic = 'force-dynamic'

export default async function BillingReturnPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  const { data: school } = profile
    ? await admin.from('schools')
        .select('subscription_status, plan, grace_until').eq('id', profile.school_id).single()
    : { data: null }

  if (school && hasActivePlan(school)) redirect('/dashboard')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      <div className="w-full max-w-[560px] rounded-[18px] bg-card px-10 py-[34px] shadow-float">
        <div className="flex flex-col gap-[26px]">
          <div className="flex items-center gap-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-success text-[15px] font-bold text-success-text">✓</span>
            <span className="text-[15px] font-semibold text-navy">Paiement reçu</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="ee-spin h-9 w-9 flex-none rounded-full border-[3.5px] border-tint-border border-t-brand" />
            <span className="text-[15px] font-semibold text-navy">Activation de votre abonnement…</span>
          </div>
          <div className="flex items-center gap-4 opacity-55">
            <span className="h-9 w-9 flex-none rounded-full border-2 border-frame" />
            <span className="text-[15px] font-semibold text-navy">Redirection vers le tableau de bord</span>
          </div>
        </div>
      </div>
      <p className="font-mono text-[14px] text-placeholder">
        Vous serez redirigé automatiquement — ne fermez pas cette page.
      </p>
      <ReturnPoller />
    </div>
  )
}
