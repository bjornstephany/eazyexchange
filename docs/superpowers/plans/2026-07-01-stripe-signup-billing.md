# Stripe Billing with a Usage-Based Free Trial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe subscription billing to EazyExchange with a usage-based free trial — no card at signup, one free exchange, and a paid plan required to create more. The only gate is exchange creation.

**Architecture:** Signup and the dashboard stay open. A school's exchange cap is derived from its subscription (trial = 1, Starter = 2, Growth = 6, Scale = unlimited) and enforced in `createExchange` + the dashboard UI. Subscribing goes through Stripe hosted Checkout; a signature-verified webhook is the source of truth and writes billing state onto the `schools` row via the service-role admin client.

**Tech Stack:** Next.js 14 App Router (route handlers + server components + server actions), `stripe` (stripe-node), Supabase (`@supabase/ssr` + service-role admin client), Vitest + React Testing Library, Tailwind + shadcn/ui.

**Design spec:** `docs/superpowers/specs/2026-07-01-stripe-signup-billing-design.md`

## Global Constraints

- Package manager is **pnpm** (never npm).
- Plan keys are exactly `'starter' | 'growth' | 'scale'`.
- Exchange caps: Trial (no active sub) = **1**, Starter = **2**, Growth = **6**, Scale = **unlimited (Infinity)**.
- Grace period: **7 days** after a failed renewal payment.
- `subscription_status` stores Stripe's status string verbatim: `active | past_due | unpaid | canceled | incomplete`. There is **no `trialing`** status — the trial is the absence of an active subscription.
- All billing-column writes go through the **service-role admin client** (`createAdminClient()`), never the browser.
- **Never log student/parent PII** (emails, names, submission contents).
- A school's own exchanges are `exchanges where school_a_id = <school_id>` (the organizer is always `school_a`).
- Verify with: `pnpm lint`, `pnpm test`, `pnpm build`.
- Tests use Vitest globals (`describe/it/expect/vi`) + RTL; `@` alias maps to repo root.

---

### Task 1: Stripe dependency, client, and plan/price config — ✅ DONE (commit 1410896)

Already implemented and controller-reviewed. Produced: `lib/billing/stripe.ts` (`getStripe`), `lib/billing/plans.ts` (`PLAN_KEYS`, `PlanKey`, `DEFAULT_PLAN`, `isPlanKey`, `coercePlan`, `priceIdForPlan`, `resolveCheckoutPlan`) + tests. No action needed. (Note: `resolveCheckoutPlan`'s `metadataPlan` param is vestigial under this model and simply goes unused.)

---

### Task 2: Database migration + `types/db.ts` billing columns

**Files:**
- Create: `supabase/migrations/20260701000002_billing_columns.sql`
- Modify: `types/db.ts` (extend `School`, add `SubscriptionStatus`, loosen `schools` insert type)

**Interfaces:**
- Produces: extended `School` type with `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `plan`, `current_period_end`, `grace_until`; exported `type SubscriptionStatus`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260701000002_billing_columns.sql`:

```sql
-- School-anchored Stripe subscription state. Written only by the webhook via
-- the service-role admin client; never writable from the browser.
alter table schools add column stripe_customer_id     text unique;
alter table schools add column stripe_subscription_id text unique;
alter table schools add column subscription_status    text;
alter table schools add column plan                   text;
alter table schools add column current_period_end     timestamptz;
alter table schools add column grace_until            timestamptz;

-- Look up a school from a Stripe customer id on every webhook event.
create index schools_stripe_customer_id_idx on schools (stripe_customer_id);

-- SECURITY: RLS is row-level, not column-level. The existing
-- "organizers update their school" policy (20260701000001) would otherwise let
-- an organizer set their own billing columns from the browser
-- (e.g. plan='scale'), granting themselves a higher exchange cap. Restrict
-- client UPDATEs to the `name` column only. The service-role admin client
-- (webhook) has BYPASSRLS + full grants, so it still writes billing state.
revoke update on schools from authenticated;
grant update (name) on schools to authenticated;
```

- [ ] **Step 2: Extend the `School` type and add `SubscriptionStatus`**

In `types/db.ts`, replace the `School` definition (currently `export type School = { id: string; name: string; created_at: string }`):

```ts
export type SubscriptionStatus =
  | 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete'

export type School = {
  id: string
  name: string
  created_at: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: SubscriptionStatus | null
  plan: 'starter' | 'growth' | 'scale' | null
  current_period_end: string | null
  grace_until: string | null
}
```

- [ ] **Step 3: Loosen the `schools` insert type**

In `types/db.ts`, the `schools` line in the `Tables` block is currently:

```ts
schools: TableDef<School, Omit<School, 'id' | 'created_at'>, Partial<School>>
```

Replace it so inserts still require only `name` (provisioning inserts `{ name }`):

```ts
schools: TableDef<School, Pick<School, 'name'> & Partial<Omit<School, 'id' | 'created_at' | 'name'>>, Partial<School>>
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — no type errors (`provisionOrganizer`'s `insert({ name })` and `createExchange`'s `insert({ name })` still type-check).

- [ ] **Step 5: Apply the migration**

Run: `supabase db push`
Expected: migration `20260701000002_billing_columns` applied. (If IPv6 hangs, use the IPv4 session-pooler `--db-url` per the WSL2 note in memory.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260701000002_billing_columns.sql types/db.ts
git commit -m "feat(billing): add school billing columns + column-privilege hardening"
```

---

### Task 3: Plan caps & active-plan logic

**Files:**
- Create: `lib/billing/limits.ts`
- Test: `lib/billing/__tests__/limits.test.ts`

**Interfaces:**
- Consumes: `School`, `SubscriptionStatus` from `@/types/db`; `PlanKey` from `@/lib/billing/plans`.
- Produces:
  - `TRIAL_EXCHANGE_CAP: number`
  - `PLAN_EXCHANGE_CAP: Record<PlanKey, number>`
  - `type BillingState = Pick<School, 'subscription_status' | 'plan' | 'grace_until'>`
  - `isInGrace(school: BillingState, now?: Date): boolean`
  - `hasActivePlan(school: BillingState, now?: Date): boolean`
  - `exchangeCap(school: BillingState, now?: Date): number`
  - `canCreateExchange(school: BillingState, currentCount: number, now?: Date): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/billing/__tests__/limits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  TRIAL_EXCHANGE_CAP, PLAN_EXCHANGE_CAP,
  isInGrace, hasActivePlan, exchangeCap, canCreateExchange,
} from '@/lib/billing/limits'

const NOW = new Date('2026-07-01T00:00:00Z')
const future = new Date('2026-07-05T00:00:00Z').toISOString()
const past = new Date('2026-06-25T00:00:00Z').toISOString()

const trial = { subscription_status: null, plan: null, grace_until: null } as const
const starter = { subscription_status: 'active', plan: 'starter', grace_until: null } as const
const growth = { subscription_status: 'active', plan: 'growth', grace_until: null } as const
const scale = { subscription_status: 'active', plan: 'scale', grace_until: null } as const

describe('limits', () => {
  it('exposes caps', () => {
    expect(TRIAL_EXCHANGE_CAP).toBe(1)
    expect(PLAN_EXCHANGE_CAP).toEqual({ starter: 2, growth: 6, scale: Infinity })
  })

  it('isInGrace only within the window for past_due/unpaid', () => {
    expect(isInGrace({ subscription_status: 'past_due', plan: 'starter', grace_until: future }, NOW)).toBe(true)
    expect(isInGrace({ subscription_status: 'past_due', plan: 'starter', grace_until: past }, NOW)).toBe(false)
    expect(isInGrace({ subscription_status: 'unpaid', plan: 'starter', grace_until: null }, NOW)).toBe(false)
    expect(isInGrace(starter, NOW)).toBe(false)
  })

  it('hasActivePlan for active or in-grace', () => {
    expect(hasActivePlan(starter, NOW)).toBe(true)
    expect(hasActivePlan({ subscription_status: 'past_due', plan: 'growth', grace_until: future }, NOW)).toBe(true)
    expect(hasActivePlan(trial, NOW)).toBe(false)
    expect(hasActivePlan({ subscription_status: 'canceled', plan: 'growth', grace_until: null }, NOW)).toBe(false)
  })

  it('exchangeCap reflects plan when active, else trial', () => {
    expect(exchangeCap(trial, NOW)).toBe(1)
    expect(exchangeCap(starter, NOW)).toBe(2)
    expect(exchangeCap(growth, NOW)).toBe(6)
    expect(exchangeCap(scale, NOW)).toBe(Infinity)
    expect(exchangeCap({ subscription_status: 'canceled', plan: 'scale', grace_until: null }, NOW)).toBe(1)
  })

  it('canCreateExchange compares count to cap', () => {
    expect(canCreateExchange(trial, 0, NOW)).toBe(true)
    expect(canCreateExchange(trial, 1, NOW)).toBe(false)
    expect(canCreateExchange(starter, 1, NOW)).toBe(true)
    expect(canCreateExchange(starter, 2, NOW)).toBe(false)
    expect(canCreateExchange(scale, 999, NOW)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/billing/__tests__/limits.test.ts`
Expected: FAIL — cannot resolve `@/lib/billing/limits`.

- [ ] **Step 3: Implement `limits.ts`**

Create `lib/billing/limits.ts`:

```ts
import type { School } from '@/types/db'
import type { PlanKey } from './plans'

export const TRIAL_EXCHANGE_CAP = 1

export const PLAN_EXCHANGE_CAP: Record<PlanKey, number> = {
  starter: 2,
  growth: 6,
  scale: Infinity,
}

export type BillingState = Pick<School, 'subscription_status' | 'plan' | 'grace_until'>

export function isInGrace(school: BillingState, now: Date = new Date()): boolean {
  const s = school.subscription_status
  if (s !== 'past_due' && s !== 'unpaid') return false
  return !!school.grace_until && now < new Date(school.grace_until)
}

export function hasActivePlan(school: BillingState, now: Date = new Date()): boolean {
  return school.subscription_status === 'active' || isInGrace(school, now)
}

export function exchangeCap(school: BillingState, now: Date = new Date()): number {
  if (hasActivePlan(school, now) && school.plan) return PLAN_EXCHANGE_CAP[school.plan]
  return TRIAL_EXCHANGE_CAP
}

export function canCreateExchange(
  school: BillingState,
  currentCount: number,
  now: Date = new Date(),
): boolean {
  return currentCount < exchangeCap(school, now)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/billing/__tests__/limits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/limits.ts lib/billing/__tests__/limits.test.ts
git commit -m "feat(billing): plan exchange caps + active-plan/grace logic"
```

---

### Task 4: Webhook event → billing patch mapper (pure)

**Files:**
- Create: `lib/billing/webhook.ts`
- Test: `lib/billing/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: `Stripe.Event` (type-only), `coercePlan` from `@/lib/billing/plans`, `School`/`SubscriptionStatus` from `@/types/db`.
- Produces:
  - `type SchoolBillingPatch = Partial<Pick<School, 'stripe_customer_id' | 'stripe_subscription_id' | 'subscription_status' | 'plan' | 'current_period_end' | 'grace_until'>>`
  - `type BillingUpdate = { customerId: string; patch: SchoolBillingPatch; setGraceIfNull?: boolean }`
  - `resolveBillingUpdate(event: Stripe.Event): BillingUpdate | null`

- [ ] **Step 1: Write the failing test**

Create `lib/billing/__tests__/webhook.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/billing/__tests__/webhook.test.ts`
Expected: FAIL — cannot resolve `@/lib/billing/webhook`.

- [ ] **Step 3: Implement the mapper**

Create `lib/billing/webhook.ts`:

```ts
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
      const patch: SchoolBillingPatch = {
        subscription_status: sub.status as SubscriptionStatus,
        stripe_subscription_id: sub.id,
        plan: coercePlan(sub.metadata?.plan),
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
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
```

Note: if your installed stripe types no longer expose `current_period_end` on `Stripe.Subscription`, cast: `(sub as unknown as { current_period_end?: number }).current_period_end`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/billing/__tests__/webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/webhook.ts lib/billing/__tests__/webhook.test.ts
git commit -m "feat(billing): map stripe events to school billing patches"
```

---

### Task 5: Webhook route handler

**Files:**
- Create: `app/api/stripe/webhook/route.ts`

**Interfaces:**
- Consumes: `getStripe`, `resolveBillingUpdate`, `createAdminClient`.
- Produces: `POST` handler at `/api/stripe/webhook`.

No unit test (thin I/O glue over the tested `resolveBillingUpdate`); verified by `pnpm build` and Task 11.

- [ ] **Step 1: Implement the route**

Create `app/api/stripe/webhook/route.ts`:

```ts
import { getStripe } from '@/lib/billing/stripe'
import { resolveBillingUpdate } from '@/lib/billing/webhook'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data: school } = await admin
      .from('schools')
      .select('id, grace_until')
      .eq('stripe_customer_id', update.customerId)
      .maybeSingle()
    if (school && !school.grace_until) {
      await admin
        .from('schools')
        .update({ grace_until: new Date(Date.now() + GRACE_MS).toISOString() })
        .eq('id', school.id)
    }
    return new Response('ok', { status: 200 })
  }

  if (Object.keys(update.patch).length > 0) {
    await admin.from('schools').update(update.patch).eq('stripe_customer_id', update.customerId)
  }
  return new Response('ok', { status: 200 })
}
```

- [ ] **Step 2: Exempt the webhook from middleware auth**

The webhook is an unauthenticated POST from Stripe. In `middleware.ts`, add it to the public routes so it isn't bounced to `/login`. Change the `isPublicRoute` block:

```ts
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/api/stripe')
```

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: build succeeds; `/api/stripe/webhook` listed as a route.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts middleware.ts
git commit -m "feat(billing): stripe webhook route writes school subscription state"
```

---

### Task 6: Checkout + Customer Portal route handlers

**Files:**
- Create: `app/billing/checkout/route.ts`
- Create: `app/billing/portal/route.ts`

**Interfaces:**
- Consumes: `createClient` (server), `createAdminClient`, `getStripe`, `resolveCheckoutPlan`, `priceIdForPlan`.
- Produces: `GET /billing/checkout` (303→Stripe Checkout), `GET /billing/portal` (303→Stripe Customer Portal).

No unit test — I/O glue over already-tested helpers. Verified by `pnpm build` and Task 11.

- [ ] **Step 1: Implement the checkout route**

Create `app/billing/checkout/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/billing/stripe'
import { resolveCheckoutPlan, priceIdForPlan } from '@/lib/billing/plans'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.redirect(new URL('/login', request.url))

  const { data: school } = await admin
    .from('schools')
    .select('id, stripe_customer_id, plan')
    .eq('id', profile.school_id)
    .single()
  if (!school) return NextResponse.redirect(new URL('/login', request.url))

  const plan = resolveCheckoutPlan({
    query: request.nextUrl.searchParams.get('plan'),
    schoolPlan: school.plan,
  })

  const stripe = getStripe()

  // Create the Stripe customer once and persist it, so the webhook can always
  // resolve the school by stripe_customer_id (including the first
  // checkout.session.completed event).
  let customerId = school.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { school_id: school.id },
    })
    customerId = customer.id
    await admin.from('schools').update({ stripe_customer_id: customerId }).eq('id', school.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    subscription_data: { metadata: { school_id: school.id, plan } },
    client_reference_id: school.id,
    metadata: { school_id: school.id, plan },
    success_url: `${appUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing`,
  })

  return NextResponse.redirect(session.url!, { status: 303 })
}
```

- [ ] **Step 2: Implement the portal route**

Create `app/billing/portal/route.ts`:

```ts
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
```

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: build succeeds; both routes listed.

- [ ] **Step 4: Commit**

```bash
git add app/billing/checkout/route.ts app/billing/portal/route.ts
git commit -m "feat(billing): checkout + customer portal route handlers"
```

---

### Task 7: Enforce the exchange cap in `createExchange`

**Files:**
- Modify: `actions/exchanges.ts` (`createExchange`)
- Test: `actions/__tests__/create-exchange.test.ts` (extend)

**Interfaces:**
- Consumes: `canCreateExchange` from `@/lib/billing/limits`.
- Produces: `createExchange` throws when the school is at its exchange cap.

- [ ] **Step 1: Write the failing tests**

Extend `actions/__tests__/create-exchange.test.ts`. First, update the mock so the `schools` select returns billing fields and the `exchanges` table supports a count query. Replace the `schools` and `exchanges` branches of `makeClient`'s `from(table)`:

```ts
      if (table === 'schools') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({
            data: opts.ownSchoolError ? null : {
              name: opts.ownSchoolName ?? 'Existing High',
              subscription_status: opts.subStatus ?? null,
              plan: opts.plan ?? null,
              grace_until: null,
            },
            error: opts.ownSchoolError ?? null,
          }) }) }),
          update: (row: any) => { calls.schoolUpdated = row; return { eq: async () => ({ error: null }) } },
          insert: (row: any) => { calls.partnerInserted = row; return { select: () => ({ single: async () => ({ data: { id: 's-partner' }, error: null }) }) } },
        }
      }
      if (table === 'exchanges') {
        return {
          select: () => ({ eq: async () => ({ count: opts.exchangeCount ?? 0, error: null }) }),
          insert: async (row: any) => { calls.exchangeInserted = row; return { error: null } },
        }
      }
```

And widen the `opts` type near the top of the file:

```ts
let opts: {
  role?: string; ownSchoolName?: string; ownSchoolError?: unknown
  subStatus?: string; plan?: string; exchangeCount?: number
}
```

Then add a new describe block:

```ts
describe('createExchange plan cap', () => {
  it('allows a trial school to create its first exchange', async () => {
    opts = { exchangeCount: 0 }
    await createExchange(form(base))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
  })

  it('blocks a trial school at 1 exchange', async () => {
    opts = { exchangeCount: 1 }
    await expect(createExchange(form(base))).rejects.toThrow(/exchange limit/i)
    expect(calls.exchangeInserted).toBeNull()
  })

  it('allows a Starter school to create a second exchange', async () => {
    opts = { exchangeCount: 1, subStatus: 'active', plan: 'starter' }
    await createExchange(form(base))
    expect(calls.exchangeInserted).toMatchObject({ name: 'France–Canada' })
  })

  it('blocks a Starter school at 2 exchanges', async () => {
    opts = { exchangeCount: 2, subStatus: 'active', plan: 'starter' }
    await expect(createExchange(form(base))).rejects.toThrow(/exchange limit/i)
  })
})
```

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `pnpm test actions/__tests__/create-exchange.test.ts`
Expected: the four existing tests PASS (billing fields default to trial, count 0 → allowed); the two "blocks" tests FAIL (no cap enforcement yet).

- [ ] **Step 3: Implement the cap check**

In `actions/exchanges.ts`, add the import at the top:

```ts
import { canCreateExchange } from '@/lib/billing/limits'
```

Extend the existing `ownSchool` select to include billing fields (it currently selects only `name`):

```ts
  const { data: ownSchool, error: ownSchoolError } = await supabase
    .from('schools')
    .select('name, subscription_status, plan, grace_until')
    .eq('id', profile.school_id).single()
  if (ownSchoolError) throw ownSchoolError
```

Then, immediately after that block (before the deferred-name rename or partner-school insert — placement between the `ownSchoolError` throw and the rename block is fine), add the cap enforcement:

```ts
  // Enforce the plan's exchange cap (trial = 1). Count only exchanges this
  // school owns — it is always school_a on exchanges it created.
  const { count, error: countError } = await supabase
    .from('exchanges')
    .select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  if (countError) throw countError
  if (ownSchool && !canCreateExchange(ownSchool, count ?? 0)) {
    throw new Error('You have reached your plan’s exchange limit. Subscribe to add more.')
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test actions/__tests__/create-exchange.test.ts`
Expected: all PASS (existing 4 + new 4).

- [ ] **Step 5: Lint + type-check**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add actions/exchanges.ts actions/__tests__/create-exchange.test.ts
git commit -m "feat(billing): enforce plan exchange cap in createExchange"
```

---

### Task 8: `/billing` page, subscribe selector, return page

**Files:**
- Create: `app/billing/page.tsx`
- Create: `app/billing/return/page.tsx`
- Create: `app/billing/return/ReturnPoller.tsx`

**Interfaces:**
- Consumes: `createClient` (server), `createAdminClient`, `hasActivePlan`, `isInGrace`, `PLAN_KEYS`.
- Produces: `/billing` status + plan selector / portal link; `/billing/return` confirmation page.

No unit test (server components doing I/O + redirects). Verified by `pnpm build` + Task 11.

- [ ] **Step 1: Build the `/billing` page**

Create `app/billing/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan, isInGrace, PLAN_EXCHANGE_CAP } from '@/lib/billing/limits'
import { PLAN_KEYS } from '@/lib/billing/plans'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

const PLAN_LABEL: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' }
const capLabel = (n: number) => (n === Infinity ? 'unlimited' : String(n))

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const { data: school } = await admin
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()

  const active = school ? hasActivePlan(school) : false
  const grace = school ? isInGrace(school) : false

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo />
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Plans &amp; billing</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {active && school?.plan ? (
            <>
              <p className="text-sm text-muted-foreground">
                You’re on the <span className="font-medium">{PLAN_LABEL[school.plan]}</span> plan
                ({capLabel(PLAN_EXCHANGE_CAP[school.plan])} exchanges).
                {grace && ' Your last payment failed — update your card to avoid losing access.'}
              </p>
              <Button asChild className="w-full">
                <Link href="/billing/portal">Manage billing</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You’re on the free trial (1 exchange). Choose a plan to create more.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {PLAN_KEYS.map((key) => (
                  <Link
                    key={key}
                    href={`/billing/checkout?plan=${key}`}
                    className="rounded-lg border p-4 text-center hover:border-primary"
                  >
                    <div className="font-medium">{PLAN_LABEL[key]}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {capLabel(PLAN_EXCHANGE_CAP[key])} exchanges
                    </div>
                  </Link>
                ))}
              </div>
              {school?.stripe_customer_id && (
                <Button asChild variant="outline" className="w-full">
                  <Link href="/billing/portal">Manage billing</Link>
                </Button>
              )}
            </>
          )}
          <Button asChild variant="ghost" className="w-full">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Build the return poller (client)**

Create `app/billing/return/ReturnPoller.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The webhook may lag the redirect by a second. Refresh the server component
// until it sees `active` and redirects to the dashboard.
export function ReturnPoller() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2000)
    return () => clearInterval(t)
  }, [router])
  return null
}
```

- [ ] **Step 3: Build the return page (server)**

Create `app/billing/return/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActivePlan } from '@/lib/billing/limits'
import { Logo } from '@/components/brand/Logo'
import { ReturnPoller } from './ReturnPoller'

export const dynamic = 'force-dynamic'

export default async function BillingReturnPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  const { data: school } = profile
    ? await admin.from('schools')
        .select('subscription_status, plan, grace_until').eq('id', profile.school_id).single()
    : { data: null }

  if (school && hasActivePlan(school)) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      <p className="text-sm text-muted-foreground">Confirming your subscription…</p>
      <ReturnPoller />
    </div>
  )
}
```

- [ ] **Step 4: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: no lint errors; build succeeds; `/billing` and `/billing/return` listed.

- [ ] **Step 5: Commit**

```bash
git add app/billing/page.tsx app/billing/return/page.tsx app/billing/return/ReturnPoller.tsx
git commit -m "feat(billing): billing page with plan selector + checkout return"
```

---

### Task 9: Dashboard cap-aware CTA + grace banner

**Files:**
- Modify: `app/(organizer)/dashboard/page.tsx`
- Create: `components/billing/PaymentWarningBanner.tsx`
- Modify: `app/(organizer)/layout.tsx`

**Interfaces:**
- Consumes: `exchangeCap`, `isInGrace` from `@/lib/billing/limits`; the organizer's school billing fields.
- Produces: dashboard "New exchange" points to `/billing` when at cap; grace banner in the organizer layout.

No unit test (server-component rendering); verified by `pnpm build` + Task 11.

- [ ] **Step 1: Make the dashboard CTA cap-aware**

`app/(organizer)/dashboard/page.tsx` currently calls `getExchanges()` and renders a fixed "New exchange" button. Fetch the school's billing state + count, compute the cap, and switch the CTA. Replace the file body:

```tsx
import { getExchanges } from '@/actions/exchanges'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { exchangeCap } from '@/lib/billing/limits'

export default async function DashboardPage() {
  const exchanges = await getExchanges()

  // Count only exchanges this school owns (it is always school_a on those).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('users').select('school_id').eq('id', user.id).single()
    : { data: null }
  const { data: school } = profile
    ? await supabase.from('schools')
        .select('subscription_status, plan, grace_until').eq('id', profile.school_id).single()
    : { data: null }
  const ownedCount = profile
    ? exchanges.filter((ex) => ex.school_a_id === profile.school_id).length
    : exchanges.length
  const atCap = school ? ownedCount >= exchangeCap(school) : ownedCount >= 1

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Exchanges</h1>
        {atCap ? (
          <Button asChild variant="outline"><Link href="/billing">Subscribe to add more</Link></Button>
        ) : (
          <Button asChild><Link href="/exchanges/new">New exchange</Link></Button>
        )}
      </div>
      {exchanges.length === 0 && (
        <p className="text-muted-foreground">No exchanges yet. Create your first one.</p>
      )}
      <div className="grid gap-4">
        {exchanges.map(ex => (
          <Card key={ex.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ex.name}</CardTitle>
                <Badge variant="outline">{ex.year}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {(ex.school_a as any)?.name} ↔ {(ex.school_b as any)?.name}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/exchanges/${ex.id}`}>View →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

Note: `getExchanges()` already selects `*` (so `school_a_id` is present on each row). Keep its existing return shape.

- [ ] **Step 2: Build the payment warning banner**

Create `components/billing/PaymentWarningBanner.tsx`:

```tsx
import Link from 'next/link'

export function PaymentWarningBanner() {
  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
      Your last payment failed — update your card to keep your plan.{' '}
      <Link href="/billing/portal" className="underline font-medium">Update payment</Link>
    </div>
  )
}
```

- [ ] **Step 3: Mount the banner in the organizer layout when in grace**

In `app/(organizer)/layout.tsx`, extend the profile fetch to include the school's billing state and render the banner while in grace. Replace the body:

```tsx
import { OrganizerNav } from '@/components/OrganizerNav'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isInGrace } from '@/lib/billing/limits'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, schools(subscription_status, plan, grace_until)')
    .eq('id', user.id)
    .single<{
      role: string
      schools: { subscription_status: string | null; plan: string | null; grace_until: string | null } | null
    }>()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const school = profile?.schools ?? null
  const showGrace = school ? isInGrace(school as never) : false

  return (
    <div className="min-h-screen bg-background">
      {showGrace && <PaymentWarningBanner />}
      <OrganizerNav />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Lint + build + full suite**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: no lint errors; all tests PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "app/(organizer)/dashboard/page.tsx" "app/(organizer)/layout.tsx" components/billing/PaymentWarningBanner.tsx
git commit -m "feat(billing): cap-aware dashboard CTA + grace-period banner"
```

---

### Task 10: Update landing pricing copy for the new caps

**Files:**
- Modify: `lib/landing/content.ts` (pricing tier feature copy)
- Test: `components/landing/__tests__/Pricing.test.tsx` if it asserts exchange-count strings (update those assertions); otherwise none

**Interfaces:** none (content only).

> **Conflict note:** `lib/landing/content.ts` was also rewritten on branch
> `wip/landing-refactor`. If that branch is merged, reconcile this copy change
> there instead.

- [ ] **Step 1: Update the exchange-count feature strings**

In `lib/landing/content.ts`, update each tier's first feature line to match the new caps:

- Starter first feature: `"1 active exchange"` → `"Up to 2 active exchanges"`
- Growth first feature: `"Up to 2 active exchanges"` → `"Up to 6 active exchanges"`
- Scale first feature: `"3+ active exchanges"` → `"Unlimited active exchanges"`

Also update the Starter/Growth/Scale `description` lines only if they state a specific exchange count that now contradicts the caps (leave them if generic).

- [ ] **Step 2: Update any test asserting the old strings**

Run: `pnpm test components/landing` — if a Pricing test asserts `"1 active exchange"` or `"3+ active exchanges"`, update those expectations to the new strings. If no such assertion exists, skip.

- [ ] **Step 3: Lint + full suite**

Run: `pnpm lint && pnpm test`
Expected: clean; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/landing/content.ts components/landing/__tests__/Pricing.test.tsx
git commit -m "feat(billing): align landing pricing copy with new exchange caps"
```

(If no test file changed, commit only `lib/landing/content.ts`.)

---

### Task 11: End-to-end verification + env documentation

**Files:**
- Modify: `CLAUDE.md` (document billing model + env vars)
- Modify: `.env.local` (local only, not committed) — add the Stripe vars

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Add the env vars locally**

Add to `.env.local` (test-mode values from the Stripe dashboard). Create three test-mode recurring (yearly) Prices matching $299/$499/$599 and paste their ids:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_SCALE=price_...
```

- [ ] **Step 2: Document in CLAUDE.md**

Add a "Billing (Stripe)" bullet under **Gotchas & Conventions** in `CLAUDE.md`:

```markdown
- **Billing is a usage-based free trial, school-anchored.** Subscription state lives on `schools` (`subscription_status`, `plan`, `grace_until`, …), written only by the Stripe webhook (`app/api/stripe/webhook/route.ts`) via the service-role admin client — never from the browser (a migration revokes client `UPDATE` on `schools` except `name`). Trial = 1 exchange; Starter = 2, Growth = 6, Scale = unlimited. The only gate is `createExchange` (+ dashboard CTA), via `lib/billing/limits.ts`. No card at signup; organizers subscribe at `/billing`. Required env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,GROWTH,SCALE}`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Register the prod webhook at `/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
```

- [ ] **Step 3: Manual end-to-end**

1. `stripe listen --forward-to localhost:3000/api/stripe/webhook` (copy the `whsec_` into `.env.local`, restart `pnpm dev`).
2. Sign up as a new organizer → land on `/dashboard`. Create 1 exchange → succeeds. The CTA now reads "Subscribe to add more"; a 2nd create is blocked.
3. `/billing` → choose Starter → Stripe Checkout, pay with `4242 4242 4242 4242` → `/billing/return` → `/dashboard`. Confirm `schools.subscription_status='active'`, `plan='starter'`.
4. Create a 2nd exchange → succeeds (cap 2). A 3rd is blocked.
5. Cancel via `/billing/portal` (or `stripe trigger customer.subscription.deleted`) → cap reverts to 1; existing exchanges still visible.
6. `stripe trigger invoice.payment_failed` → `grace_until` set; grace banner shows.

- [ ] **Step 4: Final verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(billing): document usage-based trial + Stripe env"
```

---

## Self-Review Notes

- **Spec coverage:** plans + caps (Tasks 1,3), school-anchored data model + column hardening (Task 2), webhook state machine (Tasks 4,5), checkout/portal (Task 6), cap enforcement (Task 7), billing/subscribe UI + return (Task 8), dashboard CTA + grace banner (Task 9), landing copy (Task 10), env + E2E (Task 11). Out-of-scope items (join-existing-school, grace reminder emails) intentionally excluded.
- **Type consistency:** `PlanKey`, `SubscriptionStatus` (no `trialing`), `SchoolBillingPatch`, `BillingState`, `resolveBillingUpdate`, `exchangeCap`/`canCreateExchange`/`hasActivePlan`/`isInGrace`, `resolveCheckoutPlan` defined once and consumed with matching signatures.
- **RLS/column-privilege:** Task 2 revokes broad `UPDATE` on `schools` and re-grants only `UPDATE (name)`, so an organizer cannot raise their own cap by writing `plan`; billing columns are service-role-only.
- **wip/landing-refactor conflict:** Task 10 (and any content.ts touch) overlaps the parallel landing refactor branch — reconcile at merge.
```
