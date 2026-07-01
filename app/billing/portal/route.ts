import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/billing/stripe'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  const { data: school } = profile
    ? await admin.from('schools').select('stripe_customer_id').eq('id', profile.school_id).single()
    : { data: null }

  if (!school?.stripe_customer_id) return NextResponse.redirect(new URL('/billing', request.url))

  const session = await getStripe().billingPortal.sessions.create({
    customer: school.stripe_customer_id,
    return_url: `${appUrl}/billing`,
  })
  return NextResponse.redirect(session.url, { status: 303 })
}
