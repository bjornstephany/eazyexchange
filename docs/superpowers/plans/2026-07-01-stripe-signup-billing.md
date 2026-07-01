# Stripe Billing During Organizer Signup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe subscription billing to organizer signup — card-upfront Checkout with a 14-day trial, school-anchored subscription state driven by webhooks, a 7-day grace period, then a middleware gate.

**Architecture:** Provisioning is unchanged; billing is a gate layered after account creation. Stripe hosted Checkout collects the card; a signature-verified webhook is the source of truth and writes billing columns onto the `schools` row via the service-role admin client. A pure `isEntitled(school)` function drives both the middleware gate and UI banners.

**Tech Stack:** Next.js 14 App Router (route handlers + server components), `stripe` (stripe-node), Supabase (`@supabase/ssr` + service-role admin client), Vitest + React Testing Library, Tailwind + shadcn/ui.

**Design spec:** `docs/superpowers/specs/2026-07-01-stripe-signup-billing-design.md`

## Global Constraints

- Package manager is **pnpm** (never npm).
- Plan keys are exactly `'starter' | 'growth' | 'scale'`; default plan is `'growth'`.
- Trial length: **14 days**. Grace period: **7 days**.
- `subscription_status` stores Stripe's status string verbatim: `trialing | active | past_due | canceled | unpaid | incomplete`.
- All billing-column writes go through the **service-role admin client** (`createAdminClient()`), never the browser.
- **Never log student/parent PII.** Billing code touches only organizers/schools; still, never log emails or names.
- Verify with: `pnpm lint`, `pnpm test`, `pnpm build`.
- Tests use Vitest globals (`describe/it/expect/vi`) + RTL; `@` alias maps to repo root.

---

### Task 1: Stripe dependency, client, and plan/price config

**Files:**
- Modify: `package.json` (add `stripe` dependency)
- Create: `lib/billing/stripe.ts`
- Create: `lib/billing/plans.ts`
- Test: `lib/billing/__tests__/plans.test.ts`
- Modify: `.env.local.example` if it exists (else skip); document new env vars in `README`/`CLAUDE.md` is out of scope here

**Interfaces:**
- Produces: `getStripe(): Stripe`
- Produces: `PLAN_KEYS`, `type PlanKey`, `DEFAULT_PLAN`, `isPlanKey(v): v is PlanKey`, `coercePlan(v): PlanKey`, `priceIdForPlan(plan): string`, `resolveCheckoutPlan(input): PlanKey`

- [ ] **Step 1: Add the Stripe SDK**

Run: `pnpm add stripe`
Expected: `stripe` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Write the Stripe client module**

Create `lib/billing/stripe.ts`:

```ts
import Stripe from 'stripe'

// Lazy singleton so importing this module never throws at build time when the
// secret is absent (e.g. during `next build` type-checking).
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    // apiVersion omitted → the SDK pins its own default. If your installed
    // stripe version requires it, set it to the version shown in the Stripe
    // dashboard (Developers → API version).
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  }
  return _stripe
}
```

- [ ] **Step 3: Write the failing test for plans config**

Create `lib/billing/__tests__/plans.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PLAN_KEYS, DEFAULT_PLAN, isPlanKey, coercePlan, resolveCheckoutPlan,
} from '@/lib/billing/plans'

describe('plans', () => {
  it('exposes the three plan keys', () => {
    expect(PLAN_KEYS).toEqual(['starter', 'growth', 'scale'])
    expect(DEFAULT_PLAN).toBe('growth')
  })

  it('isPlanKey narrows valid keys only', () => {
    expect(isPlanKey('starter')).toBe(true)
    expect(isPlanKey('enterprise')).toBe(false)
    expect(isPlanKey(null)).toBe(false)
  })

  it('coercePlan falls back to the default', () => {
    expect(coercePlan('scale')).toBe('scale')
    expect(coercePlan('nonsense')).toBe('growth')
    expect(coercePlan(undefined)).toBe('growth')
  })

  it('resolveCheckoutPlan prefers query, then school, then metadata, then default', () => {
    expect(resolveCheckoutPlan({ query: 'starter', schoolPlan: 'scale', metadataPlan: 'growth' })).toBe('starter')
    expect(resolveCheckoutPlan({ query: null, schoolPlan: 'scale', metadataPlan: 'growth' })).toBe('scale')
    expect(resolveCheckoutPlan({ query: 'bad', schoolPlan: null, metadataPlan: 'starter' })).toBe('starter')
    expect(resolveCheckoutPlan({ query: null, schoolPlan: null, metadataPlan: null })).toBe('growth')
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test lib/billing/__tests__/plans.test.ts`
Expected: FAIL — cannot resolve `@/lib/billing/plans`.

- [ ] **Step 5: Implement the plans module**

Create `lib/billing/plans.ts`:

```ts
export const PLAN_KEYS = ['starter', 'growth', 'scale'] as const
export type PlanKey = (typeof PLAN_KEYS)[number]
export const DEFAULT_PLAN: PlanKey = 'growth'

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === 'string' && (PLAN_KEYS as readonly string[]).includes(v)
}

export function coercePlan(v: unknown): PlanKey {
  return isPlanKey(v) ? v : DEFAULT_PLAN
}

const PRICE_ENV: Record<PlanKey, string> = {
  starter: 'STRIPE_PRICE_STARTER',
  growth: 'STRIPE_PRICE_GROWTH',
  scale: 'STRIPE_PRICE_SCALE',
}

// Server-only: reads the price id from env. Throws if unset so a
// misconfiguration surfaces loudly rather than silently billing the wrong plan.
export function priceIdForPlan(plan: PlanKey): string {
  const id = process.env[PRICE_ENV[plan]]
  if (!id) throw new Error(`Missing Stripe price env for plan: ${plan}`)
  return id
}

// Precedence: explicit ?plan= query → school's stored plan → signup metadata → default.
export function resolveCheckoutPlan(input: {
  query?: string | null
  schoolPlan?: string | null
  metadataPlan?: unknown
}): PlanKey {
  if (isPlanKey(input.query)) return input.query
  if (isPlanKey(input.schoolPlan)) return input.schoolPlan
  return coercePlan(input.metadataPlan)
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test lib/billing/__tests__/plans.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/billing/stripe.ts lib/billing/plans.ts lib/billing/__tests__/plans.test.ts
git commit -m "feat(billing): add stripe client and plan/price config"
```

---

### Task 2: Database migration + `types/db.ts` billing columns

**Files:**
- Create: `supabase/migrations/20260701000002_billing_columns.sql`
- Modify: `types/db.ts:8` (extend `School`), `types/db.ts:73` (loosen `schools` insert type), add `SubscriptionStatus` type

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
-- (e.g. subscription_status='active'), granting themselves free access.
-- Restrict client UPDATEs to the `name` column only. The service-role admin
-- client (webhook) has BYPASSRLS + full grants, so it still writes billing state.
revoke update on schools from authenticated;
grant update (name) on schools to authenticated;
```

- [ ] **Step 2: Extend the `School` type and add `SubscriptionStatus`**

In `types/db.ts`, replace the `School` definition on line 8:

```ts
export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'

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

In `types/db.ts`, the `schools` line in the `Tables` block currently is:

```ts
schools: TableDef<School, Omit<School, 'id' | 'created_at'>, Partial<School>>
```

Replace it so inserts still require only `name` (provisioning inserts `{ name }`):

```ts
schools: TableDef<School, Pick<School, 'name'> & Partial<Omit<School, 'id' | 'created_at' | 'name'>>, Partial<School>>
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — no type errors. (`provisionOrganizer`'s `insert({ name: schoolName })` still type-checks.)

- [ ] **Step 5: Apply the migration**

Run: `supabase db push`
Expected: migration `20260701000002_billing_columns` applied. (If IPv6 hangs, use the IPv4 session-pooler `--db-url` per the WSL2 note.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260701000002_billing_columns.sql types/db.ts
git commit -m "feat(billing): add school billing columns + types"
```

---

### Task 3: Entitlement function

**Files:**
- Create: `lib/billing/entitlement.ts`
- Test: `lib/billing/__tests__/entitlement.test.ts`

**Interfaces:**
- Consumes: `School`, `SubscriptionStatus` from `@/types/db`.
- Produces: `isEntitled(school: Pick<School, 'subscription_status' | 'grace_until'>, now?: Date): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/billing/__tests__/entitlement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isEntitled } from '@/lib/billing/entitlement'

const NOW = new Date('2026-07-01T00:00:00Z')
const future = new Date('2026-07-05T00:00:00Z').toISOString()
const past = new Date('2026-06-25T00:00:00Z').toISOString()

describe('isEntitled', () => {
  it('trialing and active are entitled', () => {
    expect(isEntitled({ subscription_status: 'trialing', grace_until: null }, NOW)).toBe(true)
    expect(isEntitled({ subscription_status: 'active', grace_until: null }, NOW)).toBe(true)
  })

  it('past_due/unpaid entitled only within grace window', () => {
    expect(isEntitled({ subscription_status: 'past_due', grace_until: future }, NOW)).toBe(true)
    expect(isEntitled({ subscription_status: 'past_due', grace_until: past }, NOW)).toBe(false)
    expect(isEntitled({ subscription_status: 'unpaid', grace_until: null }, NOW)).toBe(false)
  })

  it('canceled/incomplete/null are never entitled', () => {
    expect(isEntitled({ subscription_status: 'canceled', grace_until: future }, NOW)).toBe(false)
    expect(isEntitled({ subscription_status: 'incomplete', grace_until: null }, NOW)).toBe(false)
    expect(isEntitled({ subscription_status: null, grace_until: null }, NOW)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/billing/__tests__/entitlement.test.ts`
Expected: FAIL — cannot resolve `@/lib/billing/entitlement`.

- [ ] **Step 3: Implement `isEntitled`**

Create `lib/billing/entitlement.ts`:

```ts
import type { School } from '@/types/db'

export function isEntitled(
  school: Pick<School, 'subscription_status' | 'grace_until'>,
  now: Date = new Date(),
): boolean {
  const s = school.subscription_status
  if (s === 'trialing' || s === 'active') return true
  if (s === 'past_due' || s === 'unpaid') {
    return !!school.grace_until && now < new Date(school.grace_until)
  }
  return false
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/billing/__tests__/entitlement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/entitlement.ts lib/billing/__tests__/entitlement.test.ts
git commit -m "feat(billing): add isEntitled entitlement function"
```

---

### Task 4: Webhook event → billing patch mapper (pure)

**Files:**
- Create: `lib/billing/webhook.ts`
- Test: `lib/billing/__tests__/webhook.test.ts`

**Interfaces:**
- Consumes: `Stripe.Event` (type-only import), `coercePlan` from `@/lib/billing/plans`, `School`/`SubscriptionStatus` from `@/types/db`.
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
  it('checkout.session.completed → trialing + ids + plan', () => {
    const r = resolveBillingUpdate(evt('checkout.session.completed', {
      customer: 'cus_1', subscription: 'sub_1', metadata: { plan: 'scale' },
    }))
    expect(r).toEqual({
      customerId: 'cus_1',
      patch: {
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        plan: 'scale',
        subscription_status: 'trialing',
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
          subscription_status: 'trialing',
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

Note: if your installed stripe types no longer expose `current_period_end` on `Stripe.Subscription` (some API versions moved it under items), cast: `(sub as unknown as { current_period_end?: number }).current_period_end`.

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

This task has no unit test (thin I/O glue over the tested `resolveBillingUpdate`); it is verified manually with the Stripe CLI in Step 3 and by `pnpm build`.

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

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: build succeeds; `/api/stripe/webhook` listed as a route.

- [ ] **Step 3: Manual smoke test (documented, run when Stripe keys are configured)**

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger checkout.session.completed
```
Expected: handler returns 200; no crash. (Full end-to-end verified in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat(billing): stripe webhook route writes school subscription state"
```

---

### Task 6: Checkout + Customer Portal route handlers

**Files:**
- Create: `app/billing/checkout/route.ts`
- Create: `app/billing/portal/route.ts`

**Interfaces:**
- Consumes: `createClient` (server), `createAdminClient`, `getStripe`, `resolveCheckoutPlan`, `priceIdForPlan`.
- Produces: `GET /billing/checkout` (302→Stripe Checkout), `GET /billing/portal` (302→Stripe Customer Portal).

No unit test — I/O glue over already-tested `resolveCheckoutPlan`/`priceIdForPlan`. Verified by `pnpm build` and Task 11.

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
    metadataPlan: (user.user_metadata as Record<string, unknown> | undefined)?.plan,
  })

  const stripe = getStripe()

  // Create the Stripe customer once and persist it, so the webhook can always
  // resolve the school by stripe_customer_id (including on the very first
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
    subscription_data: { trial_period_days: 14, metadata: { school_id: school.id, plan } },
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

### Task 7: Middleware billing gate

**Files:**
- Create: `lib/billing/gate.ts`
- Test: `lib/billing/__tests__/gate.test.ts`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `isEntitled` (in middleware), `Database` type.
- Produces: `shouldGateForBilling(input: { pathname: string; role: string | null | undefined; entitled: boolean }): boolean`

- [ ] **Step 1: Write the failing test for the gate decision**

Create `lib/billing/__tests__/gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldGateForBilling } from '@/lib/billing/gate'

describe('shouldGateForBilling', () => {
  it('gates an unentitled organizer on an app route', () => {
    expect(shouldGateForBilling({ pathname: '/dashboard', role: 'organizer', entitled: false })).toBe(true)
  })
  it('does not gate when entitled', () => {
    expect(shouldGateForBilling({ pathname: '/dashboard', role: 'organizer', entitled: true })).toBe(false)
  })
  it('never gates students', () => {
    expect(shouldGateForBilling({ pathname: '/my-forms', role: 'student', entitled: false })).toBe(false)
  })
  it('never gates the billing routes themselves', () => {
    expect(shouldGateForBilling({ pathname: '/billing', role: 'organizer', entitled: false })).toBe(false)
    expect(shouldGateForBilling({ pathname: '/billing/checkout', role: 'organizer', entitled: false })).toBe(false)
  })
  it('never gates auth routes', () => {
    expect(shouldGateForBilling({ pathname: '/auth/confirm', role: 'organizer', entitled: false })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/billing/__tests__/gate.test.ts`
Expected: FAIL — cannot resolve `@/lib/billing/gate`.

- [ ] **Step 3: Implement the gate decision**

Create `lib/billing/gate.ts`:

```ts
export function shouldGateForBilling(input: {
  pathname: string
  role: string | null | undefined
  entitled: boolean
}): boolean {
  const { pathname, role, entitled } = input
  if (role !== 'organizer') return false
  if (entitled) return false
  if (pathname.startsWith('/billing')) return false
  if (pathname.startsWith('/auth')) return false
  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/billing/__tests__/gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Exempt the webhook from auth redirects**

In `middleware.ts`, add the Stripe webhook to the public routes so the unauthenticated Stripe POST is not bounced to `/login`. Change the `isPublicRoute` block:

```ts
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/api/stripe')
```

- [ ] **Step 6: Add the gate to middleware**

In `middleware.ts`, add imports at the top:

```ts
import { isEntitled } from '@/lib/billing/entitlement'
import { shouldGateForBilling } from '@/lib/billing/gate'
```

Then, immediately before the final `return supabaseResponse`, insert the gate. It only runs for a logged-in user on a non-public, non-billing, non-api route:

```ts
  if (
    user &&
    !isPublicRoute &&
    !pathname.startsWith('/billing') &&
    !pathname.startsWith('/api/stripe')
  ) {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    )
    const { data: profile } = await supabase
      .from('users')
      .select('role, schools(subscription_status, grace_until)')
      .eq('id', user.id)
      .single<{
        role: string
        schools: { subscription_status: string | null; grace_until: string | null } | null
      }>()

    const school = profile?.schools ?? null
    const entitled = school
      ? isEntitled({
          subscription_status: school.subscription_status as never,
          grace_until: school.grace_until,
        })
      : false

    if (shouldGateForBilling({ pathname, role: profile?.role, entitled })) {
      return NextResponse.redirect(new URL('/billing', request.url))
    }
  }

  return supabaseResponse
```

- [ ] **Step 7: Run the full test suite + build**

Run: `pnpm test && pnpm build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add lib/billing/gate.ts lib/billing/__tests__/gate.test.ts middleware.ts
git commit -m "feat(billing): gate organizer routes on subscription entitlement"
```

---

### Task 8: Post-signup redirects → billing checkout

**Files:**
- Modify: `app/auth/confirm/route.ts`
- Modify: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: existing `provisionOrganizer` / `provisionOrganizerFromOAuth` (unchanged).
- Produces: after successful organizer provisioning, redirect target is `/billing/checkout` (email path) / honors billing `next` (Google path).

No new unit test — existing auth tests (if any) plus Task 11 manual E2E cover this. Verified by `pnpm build`.

- [ ] **Step 1: Redirect email signups to checkout**

In `app/auth/confirm/route.ts`, the `type === 'signup'` branch currently ends by falling through to `return redirect(safeNext)`. Change the signup branch to send freshly-provisioned organizers to checkout instead of `next`:

```ts
      if (type === 'signup') {
        if (!data.user) return redirect('/login?error=signup_failed')
        const result = await provisionOrganizer(data.user)
        if (!result.ok) return redirect('/login?error=signup_failed')
        return redirect('/billing/checkout')
      }
      return redirect(safeNext)
```

- [ ] **Step 2: Redirect Google signups to checkout (carrying the plan)**

In `app/auth/callback/route.ts`, the `intent === 'organizer_signup'` branch currently redirects to `/dashboard`. The signup page will send `next=/billing/checkout?plan=<plan>` (Task 9). Honor that safe next, defaulting to `/billing/checkout`:

```ts
  if (intent === 'organizer_signup') {
    const result = await provisionOrganizerFromOAuth(user)
    if (!result.ok) return redirect('/login?error=signup_failed')
    return redirect(safeNext.startsWith('/billing') ? safeNext : '/billing/checkout')
  }
```

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/auth/confirm/route.ts app/auth/callback/route.ts
git commit -m "feat(billing): route new organizers to checkout after provisioning"
```

---

### Task 9: Signup plan selector + pricing CTAs

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `lib/landing/content.ts` (per-tier CTAs carry `?plan=`)
- Modify: `components/landing/Pricing.tsx` only if tier CTA href isn't already per-tier (it already uses `tier.cta.href`)
- Test: `app/(auth)/__tests__/signup.test.tsx` (extend)

**Interfaces:**
- Consumes: `PLAN_KEYS`, `DEFAULT_PLAN`, `coercePlan` from `@/lib/billing/plans`; `useSearchParams` for the `?plan=` default.
- Produces: signup form includes `plan` in `signUp` metadata and passes `next="/billing/checkout?plan=<plan>"` to `GoogleButton`.

- [ ] **Step 1: Point each pricing tier CTA at a plan-scoped signup**

In `lib/landing/content.ts`, replace each tier's `cta: SIGNUP` with a plan-scoped link. Update the three tiers:

```ts
      // Starter tier:
        cta: { label: 'Get started', href: '/signup?plan=starter' },
      // Growth tier:
        cta: { label: 'Get started', href: '/signup?plan=growth' },
      // Scale tier:
        cta: { label: 'Get started', href: '/signup?plan=scale' },
```

(The generic nav/hero `SIGNUP` → `/signup` stays as-is: no plan means the selector defaults to Growth.)

- [ ] **Step 2: Write the failing test for the plan default + metadata**

Extend `app/(auth)/__tests__/signup.test.tsx`. Add a mock for `useSearchParams` at the top (near the existing `vi.mock`) and two assertions:

```ts
// Add alongside the existing mocks:
const searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

// Add inside describe('SignupPage', ...):
it('defaults to the growth plan and submits it in metadata', async () => {
  const user = userEvent.setup()
  render(<SignupPage />)
  await user.type(screen.getByLabelText(/full name/i), 'Jane Doe')
  await user.type(screen.getByLabelText(/school name/i), 'Lincoln High')
  await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/password/i), 'supersecret')
  await user.click(screen.getByRole('button', { name: /create account/i }))

  const arg = signUp.mock.calls[0][0]
  expect(arg.options.data.plan).toBe('growth')
})
```

Also update the **existing** first test's metadata assertion, which now includes `plan`:

```ts
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe', school_name: 'Lincoln High', plan: 'growth' })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test "app/(auth)/__tests__/signup.test.tsx"`
Expected: FAIL — `plan` is undefined in metadata / selector not present.

- [ ] **Step 4: Add the plan selector to the signup page**

In `app/(auth)/signup/page.tsx`:

1. Add imports:

```ts
import { useSearchParams } from 'next/navigation'
import { PLAN_KEYS, DEFAULT_PLAN, coercePlan, type PlanKey } from '@/lib/billing/plans'
```

2. Inside the component, derive the initial plan from `?plan=` and hold it in state:

```ts
  const searchParams = useSearchParams()
  const [plan, setPlan] = useState<PlanKey>(coercePlan(searchParams.get('plan')))
```

3. Include `plan` in the signup metadata (in `handleSignup`, extend `options.data`):

```ts
        data: { full_name: name, school_name: school, plan },
```

4. Pass the plan to the Google button (replace the existing `next="/dashboard"`):

```tsx
          <GoogleButton
            intent="organizer_signup"
            next={`/billing/checkout?plan=${plan}`}
            label="Sign up with Google"
          />
```

5. Render a compact plan selector above the name field (labels map plan → display name):

```tsx
            <div className="space-y-1">
              <Label>Plan</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLAN_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlan(key)}
                    aria-pressed={plan === key}
                    className={`rounded-md border p-2 text-sm capitalize ${
                      plan === key ? 'border-primary bg-primary/5 font-medium' : 'border-input'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
```

Note: `DEFAULT_PLAN` is imported for clarity/reuse even though `coercePlan` already applies it; keep the import only if referenced, otherwise drop it to satisfy lint.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test "app/(auth)/__tests__/signup.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: no lint errors (drop unused `DEFAULT_PLAN` import if flagged); build succeeds.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/signup/page.tsx" lib/landing/content.ts "app/(auth)/__tests__/signup.test.tsx"
git commit -m "feat(billing): plan selector on signup + plan-scoped pricing CTAs"
```

---

### Task 10: `/billing` page, return page, and payment warning banner

**Files:**
- Create: `app/billing/page.tsx`
- Create: `app/billing/return/page.tsx`
- Create: `app/billing/return/ReturnPoller.tsx`
- Create: `components/billing/PaymentWarningBanner.tsx`
- Modify: `app/(organizer)/layout.tsx` (mount the banner when in grace)

**Interfaces:**
- Consumes: `createClient` (server), `createAdminClient`, `isEntitled`, `School`.
- Produces: `/billing` status/actions page; `/billing/return` confirmation page; `<PaymentWarningBanner grace_until={...} />`.

No unit test for the pages (server components doing I/O + redirects); the banner is trivial presentational markup. Verified by `pnpm build` + Task 11.

- [ ] **Step 1: Build the `/billing` page**

Create `app/billing/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isEntitled } from '@/lib/billing/entitlement'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/brand/Logo'

export const dynamic = 'force-dynamic'

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
    .select('subscription_status, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()

  const status = school?.subscription_status ?? null
  const entitled = school ? isEntitled(school) : false
  const hasCustomer = !!school?.stripe_customer_id
  const inGrace = (status === 'past_due' || status === 'unpaid') && entitled

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!hasCustomer && (
            <>
              <p className="text-sm text-muted-foreground">
                Start your subscription to activate your workspace. Your card won’t be
                charged during the 14-day trial.
              </p>
              <Button asChild className="w-full">
                <Link href="/billing/checkout">Start subscription</Link>
              </Button>
            </>
          )}
          {hasCustomer && inGrace && (
            <>
              <p className="text-sm text-red-600">
                Your last payment failed. Update your card to keep access.
              </p>
              <Button asChild className="w-full">
                <Link href="/billing/portal">Update payment</Link>
              </Button>
            </>
          )}
          {hasCustomer && !inGrace && !entitled && (
            <>
              <p className="text-sm text-red-600">
                Your subscription is inactive. Restart it to regain access.
              </p>
              <Button asChild className="w-full">
                <Link href="/billing/portal">Manage billing</Link>
              </Button>
            </>
          )}
          {hasCustomer && entitled && !inGrace && (
            <>
              <p className="text-sm text-muted-foreground">Your subscription is active.</p>
              <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/billing/portal">Manage billing</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href="/dashboard">Go to dashboard</Link>
                </Button>
              </div>
            </>
          )}
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

// The webhook may lag the redirect by a second. Refresh the server component a
// few times until it sees `trialing`/`active` and redirects to the dashboard.
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
import { isEntitled } from '@/lib/billing/entitlement'
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
        .select('subscription_status, grace_until').eq('id', profile.school_id).single()
    : { data: null }

  if (school && isEntitled(school)) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      <p className="text-sm text-muted-foreground">Confirming your subscription…</p>
      <ReturnPoller />
    </div>
  )
}
```

- [ ] **Step 4: Build the payment warning banner**

Create `components/billing/PaymentWarningBanner.tsx`:

```tsx
import Link from 'next/link'

export function PaymentWarningBanner({ graceUntil }: { graceUntil: string }) {
  const date = new Date(graceUntil).toLocaleDateString()
  return (
    <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">
      Payment failed — access ends {date}.{' '}
      <Link href="/billing/portal" className="underline font-medium">Update payment</Link>
    </div>
  )
}
```

- [ ] **Step 5: Mount the banner in the organizer layout when in grace**

In `app/(organizer)/layout.tsx`, extend the profile fetch to include the school's grace state and render the banner. Replace the body:

```tsx
import { OrganizerNav } from '@/components/OrganizerNav'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, schools(subscription_status, grace_until)')
    .eq('id', user.id)
    .single<{
      role: string
      schools: { subscription_status: string | null; grace_until: string | null } | null
    }>()
  if (profile?.role !== 'organizer') redirect('/my-forms')

  const school = profile?.schools ?? null
  const showGrace =
    !!school?.grace_until &&
    (school.subscription_status === 'past_due' || school.subscription_status === 'unpaid') &&
    new Date() < new Date(school.grace_until)

  return (
    <div className="min-h-screen bg-background">
      {showGrace && school?.grace_until && <PaymentWarningBanner graceUntil={school.grace_until} />}
      <OrganizerNav />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: Lint + build + full test suite**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: no lint errors; all tests PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/billing/page.tsx app/billing/return/page.tsx app/billing/return/ReturnPoller.tsx components/billing/PaymentWarningBanner.tsx "app/(organizer)/layout.tsx"
git commit -m "feat(billing): billing page, checkout return, and grace-period banner"
```

---

### Task 11: End-to-end verification + env documentation

**Files:**
- Modify: `CLAUDE.md` (document billing env vars + Stripe setup gotcha)
- Modify: `.env.local` (local only, not committed) — add the five Stripe vars

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Add the env vars locally**

Add to `.env.local` (test-mode values from the Stripe dashboard):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_SCALE=price_...
```

Create three test-mode recurring (yearly) Prices in Stripe matching $299/$499/$599 and paste their ids.

- [ ] **Step 2: Document in CLAUDE.md**

Add a "Billing (Stripe)" bullet under **Gotchas & Conventions** in `CLAUDE.md`:

```markdown
- **Billing is school-anchored.** Subscription state lives on `schools` (`subscription_status`, `grace_until`, etc.), written only by the Stripe webhook (`app/api/stripe/webhook/route.ts`) via the service-role admin client — never from the browser. Entitlement is derived by `lib/billing/entitlement.ts` (`isEntitled`) and enforced in `middleware.ts`. New organizers are routed to `/billing/checkout` after provisioning (14-day trial, 7-day grace then lock). Required env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{STARTER,GROWTH,SCALE}`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Register the production webhook endpoint at `/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
```

- [ ] **Step 3: Manual end-to-end (email path)**

1. `stripe listen --forward-to localhost:3000/api/stripe/webhook` (copy the `whsec_` into `.env.local`, restart `pnpm dev`).
2. Sign up at `/signup?plan=starter`, confirm the email link.
3. Expect redirect to Stripe Checkout → pay with `4242 4242 4242 4242`.
4. Expect `/billing/return` → `/dashboard`. Confirm `schools.subscription_status = 'trialing'` in the DB.
5. Visit `/dashboard` in a fresh session → not gated.

- [ ] **Step 4: Manual end-to-end (gate + grace)**

1. In the DB, set your school's `subscription_status='past_due'`, `grace_until` to a past timestamp → visiting `/dashboard` redirects to `/billing`.
2. Set `grace_until` to a future timestamp → `/dashboard` loads with the red banner.
3. Use a Stripe test clock (or `stripe trigger invoice.payment_failed`) to confirm the webhook sets `grace_until` when null.

- [ ] **Step 5: Final verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(billing): document Stripe env + webhook setup"
```

---

## Self-Review Notes

- **Spec coverage:** billing model (Tasks 6,8), plans + selection (Tasks 1,9), school-anchored data model (Task 2), flow email+Google (Task 8), webhook state machine (Tasks 4,5), entitlement (Task 3), middleware gate + grace banner (Tasks 7,10), Customer Portal (Task 6), return-page re-check (Task 10), env vars + testing (Task 11). Out-of-scope items (exchange-count enforcement, join-existing-school, grace reminder emails) are intentionally excluded.
- **Type consistency:** `PlanKey`, `SubscriptionStatus`, `SchoolBillingPatch`, `isEntitled`, `resolveBillingUpdate`, `resolveCheckoutPlan`, `shouldGateForBilling` are defined once and consumed with matching signatures across tasks.
- **RLS/column-privilege note:** RLS is row-level, so the existing `schools` UPDATE policy (`20260701000001_schools_update_own_name.sql`) would let an organizer set *any* column of their own row — including billing columns — from the browser. Task 2's migration closes this by revoking `UPDATE` on `schools` from `authenticated` and re-granting only `UPDATE (name)`. Billing columns are writable solely via the service-role admin client (BYPASSRLS). The `createExchange` name-update flow still works (it only touches `name`). This must ship in the same migration as the billing columns, never after.
```
