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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      <p className="text-sm text-muted-foreground">Confirming your subscription…</p>
      <ReturnPoller />
    </div>
  )
}
