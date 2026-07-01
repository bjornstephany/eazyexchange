import type Stripe from 'stripe'
import type { School, SubscriptionStatus } from '@/types/db'
import { coercePlan } from './plans'

export type SchoolBillingPatch = Partial<Pick<School,
  | 'stripe_customer_id'
  | 'stripe_subscription_id'
  | 'subscription_status'
  | 'plan'
  | 'current_period_end'
  | 'grace_until'
>>

export type BillingUpdate = {
  customerId: string
  patch: SchoolBillingPatch
  setGraceIfNull?: boolean
}

// Maps a verified Stripe event to a school patch. Pure: no I/O. The route
// resolves the school by `customerId` and applies `patch`. `setGraceIfNull`
// signals the stateful "start the 7-day clock only if not already running".
export function resolveBillingUpdate(event: Stripe.Event): BillingUpdate | null {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session
      if (!s.customer || !s.subscription) return null
      return {
        customerId: String(s.customer),
        patch: {
          stripe_customer_id: String(s.customer),
          stripe_subscription_id: String(s.subscription),
          plan: coercePlan(s.metadata?.plan),
          subscription_status: 'active',
        },
      }
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end
      const patch: SchoolBillingPatch = {
        subscription_status: sub.status as SubscriptionStatus,
        stripe_subscription_id: sub.id,
        plan: coercePlan(sub.metadata?.plan),
        current_period_end: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
      }
      if (sub.status === 'active') patch.grace_until = null
      return { customerId: String(sub.customer), patch }
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice
      if (!inv.customer) return null
      return { customerId: String(inv.customer), patch: {}, setGraceIfNull: true }
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      return { customerId: String(sub.customer), patch: { subscription_status: 'canceled' } }
    }
    default:
      return null
  }
}
