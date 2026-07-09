import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Control Stripe signature verification: constructEvent returns the injected
// event, or throws when `signatureValid` is false.
let incomingEvent: unknown
let signatureValid: boolean
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => {
        if (!signatureValid) throw new Error('bad signature')
        return incomingEvent
      },
    },
  }),
}))

// Admin client mock. Injectable results for the school lookup (maybeSingle) and
// for updates; records every update call. `update().eq()` returns a thenable so
// it works both when awaited directly (grace branch) and when `.select('id')` is
// chained (patch branch). `insert` covers the logAudit path into audit_log.
let lookupResult: { data: { id: string; grace_until: string | null } | null; error: { message: string } | null }
let updateResult: { error: { message: string } | null }
let lookupCalls: number
let updateCalls: Array<{ patch: Record<string, unknown>; column: string; value: unknown }>
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            lookupCalls++
            return lookupResult
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (column: string, value: unknown) => {
          updateCalls.push({ patch, column, value })
          return {
            // patch branch: `.update(...).eq(...).select('id')`
            select: () =>
              Promise.resolve({
                data: updateResult.error ? null : [{ id: 'school_1' }],
                error: updateResult.error,
              }),
            // grace branch: `await admin.update(...).eq(...)` (no .select)
            then: (resolve: (v: typeof updateResult) => unknown) => resolve(updateResult),
          }
        },
      }),
      // logAudit writes to audit_log; keep it a no-op success so it never taints
      // the response path (logAudit also swallows its own errors).
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function req(withSignature = true) {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: withSignature ? { 'stripe-signature': 'sig' } : undefined,
    body: '{}',
  })
}

// invoice.payment_failed resolves to the stateful grace branch (patch = {}).
const paymentFailedEvent = { type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } }
// customer.subscription.deleted resolves to the plain-patch branch.
const subscriptionDeletedEvent = {
  type: 'customer.subscription.deleted',
  data: { object: { id: 'sub_1', customer: 'cus_1' } },
}

beforeEach(() => {
  signatureValid = true
  incomingEvent = { type: 'some.unhandled.event', data: { object: {} } }
  lookupResult = { data: null, error: null }
  updateResult = { error: null }
  lookupCalls = 0
  updateCalls = []
})

describe('POST /api/stripe/webhook — signature', () => {
  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await POST(req(false))
    expect(res.status).toBe(400)
  })

  it('returns 400 when signature verification fails', async () => {
    signatureValid = false
    const res = await POST(req())
    expect(res.status).toBe(400)
  })
})

describe('POST /api/stripe/webhook — patch branch', () => {
  it('returns 200 and touches nothing for unhandled event types', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(lookupCalls).toBe(0)
    expect(updateCalls).toHaveLength(0)
  })

  it('applies the patch by customer id and returns 200', async () => {
    incomingEvent = subscriptionDeletedEvent
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].patch).toMatchObject({ subscription_status: 'canceled' })
    expect(updateCalls[0].column).toBe('stripe_customer_id')
    expect(updateCalls[0].value).toBe('cus_1')
  })

  it('returns 500 when the patch update fails so Stripe retries', async () => {
    incomingEvent = subscriptionDeletedEvent
    updateResult = { error: { message: 'db down' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})

describe('POST /api/stripe/webhook — grace branch (invoice.payment_failed)', () => {
  it('starts the grace clock when grace_until is null', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: { id: 'school_1', grace_until: null }, error: null }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].column).toBe('id')
    expect(updateCalls[0].value).toBe('school_1')
    expect(typeof updateCalls[0].patch.grace_until).toBe('string')
  })

  it('leaves an already-running grace clock untouched', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: { id: 'school_1', grace_until: '2026-07-10T00:00:00.000Z' }, error: null }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(0)
  })

  it('returns 200 when no school matches the customer (nothing to do)', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: null, error: null }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(0)
  })

  it('returns 500 when the school lookup fails', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: null, error: { message: 'db down' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })

  it('returns 500 when the grace update fails', async () => {
    incomingEvent = paymentFailedEvent
    lookupResult = { data: { id: 'school_1', grace_until: null }, error: null }
    updateResult = { error: { message: 'db down' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})
