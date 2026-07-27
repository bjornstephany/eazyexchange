import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let user: { id: string } | null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))

let profile: { school_id: string; status?: string } | null
let school: Record<string, unknown> | null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }
      }
      if (table === 'schools') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: school }) }) }) }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

let configured = true
let stripeThrows = false
const retrieveSub = vi.fn(async (_id: string) => ({ items: { data: [{ id: 'si_1' }] } }))
const createPortalSession = vi.fn(async (_p: unknown) => ({ url: 'https://portal.stripe.test/s/1' }))
vi.mock('@/lib/billing/stripe', () => ({
  isStripeConfigured: () => configured,
  getStripe: () => ({
    subscriptions: {
      retrieve: async (id: string) => {
        if (stripeThrows) throw new Error('no such subscription')
        return retrieveSub(id)
      },
    },
    billingPortal: { sessions: { create: (p: unknown) => createPortalSession(p) } },
  }),
}))

import { GET } from '@/app/billing/upgrade/route'

function req(qs: string) {
  return new NextRequest(new URL(`http://localhost/billing/upgrade?${qs}`))
}
async function location(qs: string): Promise<string | null> {
  return (await GET(req(qs))).headers.get('location')
}

const ACTIVE_STARTER = {
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  subscription_status: 'active',
  plan: 'starter',
  grace_until: null,
}

beforeEach(() => {
  retrieveSub.mockClear(); createPortalSession.mockClear()
  user = { id: 'u1' }
  profile = { school_id: 'sch_1', status: 'approved' }
  school = { ...ACTIVE_STARTER }
  configured = true
  stripeThrows = false
  process.env.STRIPE_PRICE_STARTER = 'price_s'
  process.env.STRIPE_PRICE_GROWTH = 'price_g'
  process.env.STRIPE_PRICE_SCALE = 'price_x'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

describe('GET /billing/upgrade', () => {
  it('sends an anonymous visitor to /login', async () => {
    user = null
    expect(await location('plan=growth')).toBe('http://localhost/login')
  })

  // Service role: RLS is not in this path, so the status check has to be.
  it.each(['pending', 'rejected'])('sends a %s account to /pending', async (status) => {
    profile = { school_id: 'sch_1', status }
    expect(await location('plan=growth')).toBe('http://localhost/pending')
    expect(createPortalSession).not.toHaveBeenCalled()
  })

  it('sends a bad plan query back to /billing', async () => {
    expect(await location('plan=enterprise')).toBe('http://localhost/billing')
    expect(await location('')).toBe('http://localhost/billing')
  })

  it('sends a trial school to checkout instead', async () => {
    school = { ...ACTIVE_STARTER, subscription_status: null, plan: null, stripe_subscription_id: null }
    expect(await location('plan=growth')).toBe('http://localhost/billing/checkout?plan=growth')
  })

  it('refuses a downgrade', async () => {
    school = { ...ACTIVE_STARTER, plan: 'scale' }
    expect(await location('plan=growth')).toBe('http://localhost/billing')
    expect(createPortalSession).not.toHaveBeenCalled()
  })

  it('refuses a same-plan re-confirmation', async () => {
    expect(await location('plan=starter')).toBe('http://localhost/billing')
    expect(createPortalSession).not.toHaveBeenCalled()
  })

  it('degrades to ?error=unavailable when Stripe is not configured', async () => {
    configured = false
    expect(await location('plan=growth')).toBe('http://localhost/billing?error=unavailable')
  })

  it('degrades to ?error=unavailable when the target price env is missing', async () => {
    delete process.env.STRIPE_PRICE_GROWTH
    expect(await location('plan=growth')).toBe('http://localhost/billing?error=unavailable')
  })

  it('degrades to ?error=unavailable when Stripe throws', async () => {
    stripeThrows = true
    expect(await location('plan=growth')).toBe('http://localhost/billing?error=unavailable')
  })

  it('opens a subscription_update_confirm portal session for a real upgrade', async () => {
    expect(await location('plan=growth')).toBe('https://portal.stripe.test/s/1')
    expect(retrieveSub).toHaveBeenCalledWith('sub_1')
    expect(createPortalSession).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://app.test/billing',
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: 'sub_1',
          items: [{ id: 'si_1', price: 'price_g', quantity: 1 }],
        },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: 'https://app.test/billing' },
        },
      },
    })
  })
})
