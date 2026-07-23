import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'
import { isPlanKey, priceIdForPlan, hasPriceForPlan } from '@/lib/billing/plans'
import { hasActivePlan } from '@/lib/billing/limits'
import { isUpgrade } from '@/lib/billing/upgrade'

export const runtime = 'nodejs'

// Upgrading an EXISTING subscriber cannot go through /billing/checkout: a second
// `mode: 'subscription'` Checkout Session against the same customer creates a
// second, parallel subscription and a second charge. This route swaps the price
// on the current subscription item via a Stripe-hosted confirmation screen, so
// Stripe owns the proration, the card re-authentication and the receipt.
//
// PREREQUISITE (Stripe dashboard, not code): the customer portal configuration
// must have subscription updates enabled with all three prices listed under
// `features.subscription_update.products`, or `sessions.create` returns a 400
// and this route degrades to ?error=unavailable.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const plan = request.nextUrl.searchParams.get('plan')
  if (!isPlanKey(plan)) return NextResponse.redirect(new URL('/billing', request.url))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.redirect(new URL('/login', request.url))

  const { data: school } = await admin
    .from('schools')
    .select('stripe_customer_id, stripe_subscription_id, subscription_status, plan, grace_until')
    .eq('id', profile.school_id)
    .single()
  if (!school) return NextResponse.redirect(new URL('/login', request.url))

  // No subscription to modify — this is a trial school, and checkout is the
  // correct route for a first purchase.
  if (!school.stripe_customer_id || !school.stripe_subscription_id || !hasActivePlan(school)) {
    return NextResponse.redirect(new URL(`/billing/checkout?plan=${plan}`, request.url))
  }

  // Upgrade-only. Without this, a hand-edited URL would open a surprise
  // downgrade or a pointless same-plan confirmation.
  if (!school.plan || !isUpgrade(school.plan, plan)) {
    return NextResponse.redirect(new URL('/billing', request.url))
  }

  if (!isStripeConfigured() || !hasPriceForPlan(plan)) {
    return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
  }

  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(school.stripe_subscription_id)
    const itemId = sub.items.data[0]?.id
    if (!itemId) {
      console.error('[billing/upgrade] subscription has no items')
      return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: school.stripe_customer_id,
      return_url: `${appUrl}/billing`,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: school.stripe_subscription_id,
          items: [{ id: itemId, price: priceIdForPlan(plan), quantity: 1 }],
        },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: `${appUrl}/billing` },
        },
      },
    })
    return NextResponse.redirect(session.url, { status: 303 })
  } catch (err) {
    // Portal update flow not enabled, invalid key, Stripe outage. Log the API
    // message only (no PII) rather than surfacing a raw 500.
    console.error('[billing/upgrade] Stripe error:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
  }
}
