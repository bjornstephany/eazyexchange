import { describe, it, expect, vi, beforeEach } from 'vitest'

// Checkout attaches the card to the SUBSCRIPTION and never writes
// invoice_settings.default_payment_method, so reading only the latter told a
// paying customer "no payment method" and offered them a second subscription.
let scenario: {
  school: any
  customer: any
  retrieveArgs: any[]
}

vi.mock('@/lib/auth/require', () => ({
  requireUser: async () => ({ id: 'u1' }),
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: {
      id: 'u1', role: 'organizer', school_id: 's-1', full_name: 'Marie B.',
      email: 'a@b.com', org_role: 'owner', locale: 'fr',
      schools: { name: 'Lycée X', country: 'FR' },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        single: async () => ({ data: scenario.school, error: null }),
        then: (resolve: any) =>
          resolve(table === 'exchanges' ? { count: 1 } : { data: scenario.school }),
      }
      return b
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: () => ({
    customers: {
      retrieve: async (...args: any[]) => {
        scenario.retrieveArgs = args
        return scenario.customer
      },
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (k: string, v?: Record<string, unknown>) =>
    v ? `${k}:${JSON.stringify(v)}` : k,
}))

import { getBillingOverview } from '@/actions/settings'

const card = (last4: string) => ({
  card: { brand: 'visa', last4, exp_month: 4, exp_year: 2029 },
})

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  scenario = {
    school: {
      subscription_status: 'active', plan: 'starter',
      grace_until: null, stripe_customer_id: 'cus_1',
    },
    customer: { invoice_settings: {}, subscriptions: { data: [] } },
    retrieveArgs: [],
  }
})

describe('getBillingOverview — payment method lookup', () => {
  it('expands both default_payment_method fields in one call', async () => {
    await getBillingOverview()
    expect(scenario.retrieveArgs[1].expand).toEqual([
      'invoice_settings.default_payment_method',
      'subscriptions.data.default_payment_method',
    ])
  })

  it('prefers the customer-level default payment method', async () => {
    scenario.customer = {
      invoice_settings: { default_payment_method: card('1111') },
      subscriptions: { data: [{ default_payment_method: card('2222') }] },
    }
    const { payment } = await getBillingOverview()
    expect(payment.note).toContain('"last4":"1111"')
  })

  it("falls back to the subscription's card — the one Checkout actually sets", async () => {
    scenario.customer = {
      invoice_settings: {},
      subscriptions: { data: [{ default_payment_method: card('4242') }] },
    }
    const { payment } = await getBillingOverview()
    expect(payment.note).toContain('billing.payment.card')
    expect(payment.note).toContain('"last4":"4242"')
    expect(payment.note).toContain('"brand":"Visa"')
  })

  it('reports no card when neither field holds one', async () => {
    const { payment } = await getBillingOverview()
    expect(payment.note).toBe('billing.payment.noneNote')
  })
})

describe('getBillingOverview — the payment row never links to /billing', () => {
  it('offers the Stripe portal on an active plan, card or no card', async () => {
    const { payment } = await getBillingOverview()
    expect(payment.manage).toEqual({
      cta: 'billing.payment.editCta', href: '/billing/portal',
    })
  })

  // The trial collects the card when a plan is chosen; the header's "View
  // plans" CTA already carries that action.
  it('offers no button at all on the trial', async () => {
    scenario.school = {
      subscription_status: null, plan: null,
      grace_until: null, stripe_customer_id: null,
    }
    const { payment } = await getBillingOverview()
    expect(payment.manage).toBeNull()
    expect(payment.note).toBe('billing.payment.noneNote')
  })
})
