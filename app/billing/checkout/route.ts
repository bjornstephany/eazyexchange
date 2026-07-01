import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/billing/stripe'
import { resolveCheckoutPlan, priceIdForPlan } from '@/lib/billing/plans'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.redirect(new URL('/login', request.url))

  const { data: school } = await admin
    .from('schools')
    .select('id, stripe_customer_id, plan')
    .eq('id', profile.school_id)
    .single()
  if (!school) return NextResponse.redirect(new URL('/login', request.url))

  const plan = resolveCheckoutPlan({
    query: request.nextUrl.searchParams.get('plan'),
    schoolPlan: school.plan,
  })

  const stripe = getStripe()

  // Create the Stripe customer once and persist it, so the webhook can always
  // resolve the school by stripe_customer_id (including the first
  // checkout.session.completed event).
  let customerId = school.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { school_id: school.id },
    })
    customerId = customer.id
    await admin.from('schools').update({ stripe_customer_id: customerId }).eq('id', school.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    subscription_data: { metadata: { school_id: school.id, plan } },
    client_reference_id: school.id,
    metadata: { school_id: school.id, plan },
    success_url: `${appUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing`,
  })

  return NextResponse.redirect(session.url!, { status: 303 })
}
