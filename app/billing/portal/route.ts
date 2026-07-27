import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id, status').eq('id', user.id).maybeSingle()
  // Service role: RLS is not in this path (see /billing/checkout).
  if (profile && profile.status !== 'approved') {
    return NextResponse.redirect(new URL('/pending', request.url))
  }
  const { data: school } = profile
    ? await admin.from('schools').select('stripe_customer_id').eq('id', profile.school_id).single()
    : { data: null }

  if (!school?.stripe_customer_id) return NextResponse.redirect(new URL('/billing', request.url))

  // Same graceful degradation as /billing/checkout: billing may be deployed
  // inert (no Stripe env yet), and the Customer Portal has to be activated in
  // the Stripe dashboard before `billingPortal.sessions.create` will succeed.
  if (!isStripeConfigured()) {
    return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: school.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    })
    return NextResponse.redirect(session.url, { status: 303 })
  } catch (err) {
    // Portal not activated, invalid key, Stripe outage. Log the API message
    // only (no PII) and fall back to the notice rather than a raw 500.
    console.error('[billing/portal] Stripe error:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
  }
}
