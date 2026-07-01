import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, isInGrace, PLAN_EXCHANGE_CAP } from '@/lib/billing/limits'
import { PLAN_KEYS } from '@/lib/billing/plans'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' }
const capLabel = (n: number) => (n === Infinity ? 'unlimited' : String(n))

export default async function BillingPage() {
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo />
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Plans &amp; billing</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {active && school?.plan ? (
            <>
              <p className="text-sm text-muted-foreground">
                You’re on the <span className="font-medium">{PLAN_LABEL[school.plan]}</span> plan
                ({capLabel(PLAN_EXCHANGE_CAP[school.plan])} exchanges).
                {grace && ' Your last payment failed — update your card to avoid losing access.'}
              </p>
              <Button asChild className="w-full">
                <Link href="/billing/portal">Manage billing</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You’re on the free trial (1 exchange). Choose a plan to create more.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {PLAN_KEYS.map((key) => (
                  <Link
                    key={key}
                    href={`/billing/checkout?plan=${key}`}
                    className="rounded-lg border p-4 text-center hover:border-primary"
                  >
                    <div className="font-medium">{PLAN_LABEL[key]}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {capLabel(PLAN_EXCHANGE_CAP[key])} exchanges
                    </div>
                  </Link>
                ))}
              </div>
              {school?.stripe_customer_id && (
                <Button asChild variant="outline" className="w-full">
                  <Link href="/billing/portal">Manage billing</Link>
                </Button>
              )}
            </>
          )}
          <Button asChild variant="ghost" className="w-full">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
