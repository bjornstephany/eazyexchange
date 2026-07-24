import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Stripe from 'stripe'
import { resolveBillingUpdate } from '@/lib/billing/webhook'

function evt(type: string, object: unknown): Stripe.Event {
  return { type, data: { object } } as unknown as Stripe.Event
}

describe('resolveBillingUpdate', () => {
  it('checkout.session.completed → active + ids + plan', () => {
    const r = resolveBillingUpdate(evt('checkout.session.completed', {
      customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'scale' },
    }))
    expect(r).toEqual({
      customerId: 'cus_1',
      patch: {
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        plan: 'scale',
        subscription_status: 'active',
      },
    })
  })

  it('subscription.updated syncs status, plan, period; clears grace when active', () => {
    const r = resolveBillingUpdate(evt('customer.subscription.updated', {
      id: 'sub_1', customer: 'cus_1', status: 'active',
      current_period_end: 1767225600, metadata: { plan: 'growth' },
    }))
    expect(r?.customerId).toBe('cus_1')
    expect(r?.patch.subscription_status).toBe('active')
    expect(r?.patch.plan).toBe('growth')
    expect(r?.patch.stripe_subscription_id).toBe('sub_1')
    expect(r?.patch.current_period_end).toBe(new Date(1767225600 * 1000).toISOString())
    expect(r?.patch.grace_until).toBeNull()
  })

  it('subscription.updated to past_due does not clear grace', () => {
    const r = resolveBillingUpdate(evt('customer.subscription.updated', {
      id: 'sub_1', customer: 'cus_1', status: 'past_due',
      current_period_end: 1767225600, metadata: {},
    }))
    expect(r?.patch.subscription_status).toBe('past_due')
    expect('grace_until' in (r?.patch ?? {})).toBe(false)
  })

  it('subscription.updated without a valid plan omits plan from the patch', () => {
    const r = resolveBillingUpdate(evt('customer.subscription.updated', {
      id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: 1767225600, metadata: {},
    }))
    expect('plan' in (r?.patch ?? {})).toBe(false)
    expect(r?.patch.subscription_status).toBe('active')
  })

  describe('plan resolution from the subscription price', () => {
    const KEYS = ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_SCALE'] as const
    const originals = KEYS.map((k) => [k, process.env[k]] as const)
    beforeEach(() => {
      process.env.STRIPE_PRICE_STARTER = 'price_s'
      process.env.STRIPE_PRICE_GROWTH = 'price_g'
      process.env.STRIPE_PRICE_SCALE = 'price_x'
    })
    afterEach(() => {
      for (const [k, v] of originals) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    })

    function updated(priceId: string | undefined, metaPlan?: string) {
      return resolveBillingUpdate(evt('customer.subscription.updated', {
        id: 'sub_1', customer: 'cus_1', status: 'active', current_period_end: 1767225600,
        metadata: metaPlan ? { plan: metaPlan } : {},
        items: priceId ? { data: [{ id: 'si_1', price: { id: priceId } }] } : undefined,
      }))
    }

    // The landmine: the portal changed the price but left metadata.plan stale.
    it('prefers the price on the subscription over stale metadata', () => {
      expect(updated('price_g', 'starter')?.patch.plan).toBe('growth')
    })

    it('falls back to metadata when the price id is unknown', () => {
      expect(updated('price_unknown', 'starter')?.patch.plan).toBe('starter')
    })

    it('falls back to metadata when there are no items', () => {
      expect(updated(undefined, 'scale')?.patch.plan).toBe('scale')
    })

    it('leaves plan untouched when neither price nor metadata resolves', () => {
      expect('plan' in (updated('price_unknown')?.patch ?? {})).toBe(false)
    })
  })

  it('invoice.payment_failed → setGraceIfNull with empty patch', () => {
    const r = resolveBillingUpdate(evt('invoice.payment_failed', { customer: 'cus_1' }))
    expect(r).toEqual({ customerId: 'cus_1', patch: {}, setGraceIfNull: true })
  })

  it('subscription.deleted → canceled', () => {
    const r = resolveBillingUpdate(evt('customer.subscription.deleted', {
      id: 'sub_1', customer: 'cus_1',
    }))
    expect(r).toEqual({ customerId: 'cus_1', patch: { subscription_status: 'canceled' } })
  })

  it('unknown events are ignored', () => {
    expect(resolveBillingUpdate(evt('invoice.paid', { customer: 'cus_1' }))).toBeNull()
  })
})
