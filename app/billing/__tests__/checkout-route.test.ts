import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// /billing/checkout is the one route that can take money. It reads the profile
// and the school with the SERVICE ROLE, so RLS — the gate everything else
// leans on — is not in this path at all. These cases pin the app-side gate.

let user: { id: string; email?: string } | null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))

let profile: { school_id: string; status?: string } | null
let school: Record<string, unknown> | null
const updateSchool = vi.fn((_patch: unknown) => ({ eq: async () => ({ error: null }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }
      }
      if (table === 'schools') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: school }) }) }),
          update: (patch: unknown) => updateSchool(patch),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

const createCustomer = vi.fn(async () => ({ id: 'cus_new' }))
const createSession = vi.fn(async () => ({ url: 'https://checkout.stripe.test/s/1' }))
vi.mock('@/lib/billing/stripe', () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    customers: { create: () => createCustomer() },
    checkout: { sessions: { create: () => createSession() } },
  }),
}))

import { GET } from '@/app/billing/checkout/route'

async function location(qs = 'plan=starter'): Promise<string | null> {
  const res = await GET(new NextRequest(new URL(`http://localhost/billing/checkout?${qs}`)))
  return res.headers.get('location')
}

beforeEach(() => {
  createCustomer.mockClear(); createSession.mockClear(); updateSchool.mockClear()
  user = { id: 'u1', email: 'org@example.com' }
  profile = { school_id: 'sch_1', status: 'approved' }
  school = { id: 'sch_1', stripe_customer_id: 'cus_1', plan: null }
  process.env.STRIPE_PRICE_STARTER = 'price_s'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

describe('GET /billing/checkout', () => {
  it('sends an anonymous visitor to /login', async () => {
    user = null
    expect(await location()).toBe('http://localhost/login')
    expect(createSession).not.toHaveBeenCalled()
  })

  it.each(['pending', 'rejected'])('sends a %s account to /pending, opening no session', async (status) => {
    profile = { school_id: 'sch_1', status }
    expect(await location()).toBe('http://localhost/pending')
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('opens a checkout session for an approved organizer', async () => {
    expect(await location()).toBe('https://checkout.stripe.test/s/1')
    expect(createSession).toHaveBeenCalled()
  })
})
