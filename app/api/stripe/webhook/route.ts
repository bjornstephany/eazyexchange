import { getStripe } from '@/lib/billing/stripe'
import { resolveBillingUpdate } from '@/lib/billing/webhook'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'

// Stripe requires the raw request body for signature verification; do not parse.
export const runtime = 'nodejs'

const GRACE_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('missing signature', { status: 400 })

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch {
    return new Response('invalid signature', { status: 400 })
  }

  const update = resolveBillingUpdate(event)
  if (!update) return new Response('ok', { status: 200 })

  const admin = createAdminClient()

  if (update.setGraceIfNull) {
    const { data: school, error: lookupError } = await admin
      .from('schools')
      .select('id, grace_until')
      .eq('stripe_customer_id', update.customerId)
      .maybeSingle()
    // 500 → Stripe retries with backoff. A swallowed error drops the event forever.
    if (lookupError) return new Response('school lookup failed', { status: 500 })
    if (school && !school.grace_until) {
      const { error: graceError } = await admin
        .from('schools')
        .update({ grace_until: new Date(Date.now() + GRACE_MS).toISOString() })
        .eq('id', school.id)
      if (graceError) return new Response('grace update failed', { status: 500 })
      await logAudit({
        action: 'billing.grace_started',
        actorUserId: null, // system actor: Stripe webhook
        actorSchoolId: school.id,
        targetType: 'school',
        targetId: school.id,
      })
    }
    return new Response('ok', { status: 200 })
  }

  if (Object.keys(update.patch).length > 0) {
    const { data: patched, error: patchError } = await admin
      .from('schools')
      .update(update.patch)
      .eq('stripe_customer_id', update.customerId)
      .select('id')
    if (patchError) return new Response('school update failed', { status: 500 })
    for (const school of patched ?? []) {
      await logAudit({
        action: 'billing.subscription_updated',
        actorUserId: null, // system actor: Stripe webhook
        actorSchoolId: school.id,
        targetType: 'school',
        targetId: school.id,
        metadata: {
          subscription_status: update.patch.subscription_status ?? null,
          plan: update.patch.plan ?? null,
        },
      })
    }
  }
  return new Response('ok', { status: 200 })
}
