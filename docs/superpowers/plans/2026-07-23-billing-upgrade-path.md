# Billing Upgrade Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a paying organizer who hits their exchange cap a working, self-service upgrade — priced by the capacity it adds — that survives the Stripe webhook round-trip.

**Architecture:** A new `GET /billing/upgrade?plan=X` route opens a Stripe-hosted `subscription_update_confirm` portal flow against the school's existing subscription (checkout would create a *second* subscription). The webhook learns to read the plan from the price ID on the subscription instead of stale metadata, so the upgrade actually sticks. `/billing` gains a three-state matrix (grace → trial → paid) driven by real exchange usage, and its French hardcoded copy is retired into the `organizer.billing` i18n namespace.

**Tech Stack:** Next.js 15 App Router (Server Components + route handlers), Supabase (RLS reads + service-role admin client), `stripe@22.3.0`, next-intl v4, Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-23-billing-upgrade-path-design.md`

## Global Constraints

- **Branch:** `feature/billing-upgrade-path` in this worktree. Confirm with `git branch --show-current` before every commit. Never commit to `main`.
- **Never `git add -A` / `git add .`** — stage only the files named in each task's `git add` line.
- **Package manager is pnpm**, not npm.
- **Gate before merge:** `pnpm lint && pnpm test && pnpm build`. `pnpm test:rls` is **not** triggered — this change adds no migration, no table, no RLS policy, no bucket.
- **Plan keys stay `starter` / `growth` / `scale`.** Only display is localized. Display labels in French: Essentiel / Association / Réseau.
- **Caps are `PLAN_EXCHANGE_CAP`** in `lib/billing/limits.ts`: starter 2, growth 6, scale `Infinity`; trial 1. **Do not change any cap or price.**
- **French copy uses typographic apostrophes (`’`, U+2019), never ASCII `'`.** Guard: `messages/fr.json` currently contains exactly **15** ASCII apostrophes; after every message-file edit it must still contain 15. Check with `grep -o "'" messages/fr.json | wc -l`.
- **If Task 4 is dispatched to a subagent, use Sonnet tier or above** — Haiku strips French accents. Every French string in this plan is written out verbatim; transcribe, don't translate.
- **Never log student/parent PII.** Route `catch` blocks log the Stripe API message only, as the existing `/billing/portal` and `/billing/checkout` routes do.
- **Expected outcomes are structured returns / redirects, never thrown errors** (production redacts thrown Server Action + RSC messages).
- **next-intl keys must be string literals**, never template-literal lookups, or the `global.d.ts` key gate cannot check them against `en.json`. The one sanctioned escape hatch is `asAppTranslator()` from `lib/i18n/messages.ts` — use it for the shared plan-copy helper, and cover the keys with tests instead.
- **Out of scope:** downgrades, cancellation, annual/monthly toggle, pricing changes, new tiers, ROI framing.

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `lib/billing/upgrade.ts` | Pure: plan ordering (`PLAN_RANK`), `upgradeTargets`, `isUpgrade`, `capDelta`. The single definition of "an upgrade". |
| `lib/billing/plan-copy.ts` | Pure: turns an `AppTranslator` into per-plan display strings (`planCopy`, `featureBullets`, `deltaLabel`). Shared by the client selector and the server upgrade cards. |
| `app/billing/upgrade/route.ts` | `GET /billing/upgrade?plan=X` → guards → Stripe `subscription_update_confirm` portal session. |
| `components/billing/PlanCard.tsx` | Presentational card. No billing logic, no translations — all strings arrive as props so it works in both the server and client trees. |
| `components/billing/UpgradeOptions.tsx` | Async Server Component. Renders one `PlanCard` per `upgradeTargets(current)`, each with its own CTA and its `capDelta` badge. |
| `lib/billing/__tests__/upgrade.test.ts` | Tests for `lib/billing/upgrade.ts`. |
| `lib/billing/__tests__/plan-copy.test.ts` | Tests for `lib/billing/plan-copy.ts` against the real French catalog. |
| `app/billing/__tests__/upgrade-route.test.ts` | Guard-matrix + Stripe-payload tests for the route. |
| `components/billing/__tests__/UpgradeOptions.test.tsx` | Tests for `UpgradeOptions`. |
| `app/billing/__tests__/page.test.tsx` | State-matrix tests for `/billing`. |

**Modified files**

| Path | Change |
|---|---|
| `lib/billing/plans.ts` | Add `planForPriceId` (inverse of `priceIdForPlan`). |
| `lib/billing/webhook.ts` | `customer.subscription.updated`: resolve plan price ID → metadata → unchanged. |
| `lib/billing/display.ts` | Reduced to `usagePct` math; all French copy retired to the message catalog. |
| `actions/settings.ts` | `usageLine` → `usagePct`. |
| `components/billing/PlanSelector.tsx` | Renders `PlanCard`; reads copy from `t()` instead of `display.ts`. |
| `app/billing/page.tsx` | Exchange count, three-state matrix, `?reason=limit`, i18n provider. |
| `components/shell/OrganizerShell.tsx:81` | `router.push('/billing?reason=limit')`. |
| `components/shell/NewExchangeModal.tsx:88` | `router.push('/billing?reason=limit')`. |
| `messages/{fr,en,es,de,it}.json` | New `organizer.billing.*` keys. |
| `messages/__tests__/parity.test.ts` | Anchor assertions for the new French keys. |
| `lib/billing/__tests__/{webhook,plans,display}.test.ts` | New/updated cases. |
| `components/billing/__tests__/PlanSelector.test.tsx` | Render under the intl provider. |
| `components/shell/__tests__/{OrganizerShell,NewExchangeModal}.test.tsx` | Assert the `?reason=limit` redirect. |
| `CLAUDE.md` | Billing gotcha: the Stripe portal configuration prerequisite + the price-ID plan resolution. |

---

## Task 0: Worktree setup

This worktree has no `node_modules` yet. Nothing below runs until this is done.

- [ ] **Step 1: Confirm the branch**

Run: `git branch --show-current`
Expected: `feature/billing-upgrade-path`. If it is anything else, **stop and report** — do not proceed.

- [ ] **Step 2: Link env + install deps**

Run: `pnpm wt`
Expected: it links `.env.local` / `.env.staging`, writes `.wtport`, and installs dependencies. Finishes without an error.

- [ ] **Step 3: Confirm the baseline suite is green**

Run: `pnpm test 2>&1 | tail -20`
Expected: all test files pass. If a single file fails, re-run just that file before debugging — a sibling session may have been mid-write.

No commit for this task.

---

## Task 1: `lib/billing/upgrade.ts` — the definition of an upgrade

**Files:**
- Create: `lib/billing/upgrade.ts`
- Test: `lib/billing/__tests__/upgrade.test.ts`

**Interfaces:**
- Consumes: `PLAN_KEYS`, `PlanKey` from `lib/billing/plans.ts`; `PLAN_EXCHANGE_CAP` from `lib/billing/limits.ts`.
- Produces:
  - `PLAN_RANK: Record<PlanKey, number>`
  - `upgradeTargets(current: PlanKey): PlanKey[]`
  - `isUpgrade(current: PlanKey, target: PlanKey): boolean`
  - `type CapDelta = { kind: 'more'; n: number } | { kind: 'unlimited' }`
  - `capDelta(current: PlanKey, target: PlanKey): CapDelta`

- [ ] **Step 1: Write the failing test**

Create `lib/billing/__tests__/upgrade.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PLAN_RANK, upgradeTargets, isUpgrade, capDelta } from '@/lib/billing/upgrade'

describe('PLAN_RANK', () => {
  it('orders starter < growth < scale', () => {
    expect(PLAN_RANK.starter).toBeLessThan(PLAN_RANK.growth)
    expect(PLAN_RANK.growth).toBeLessThan(PLAN_RANK.scale)
  })
})

describe('upgradeTargets', () => {
  it('offers everything above the current plan, in ascending order', () => {
    expect(upgradeTargets('starter')).toEqual(['growth', 'scale'])
    expect(upgradeTargets('growth')).toEqual(['scale'])
  })
  it('offers nothing on the top plan', () => {
    expect(upgradeTargets('scale')).toEqual([])
  })
})

describe('isUpgrade', () => {
  it('is true only when the target outranks the current plan', () => {
    expect(isUpgrade('starter', 'growth')).toBe(true)
    expect(isUpgrade('starter', 'scale')).toBe(true)
    expect(isUpgrade('growth', 'starter')).toBe(false) // downgrade
    expect(isUpgrade('growth', 'growth')).toBe(false)  // same plan
    expect(isUpgrade('scale', 'growth')).toBe(false)
  })
})

describe('capDelta', () => {
  it('reports the added capacity for bounded targets', () => {
    // starter 2 → growth 6
    expect(capDelta('starter', 'growth')).toEqual({ kind: 'more', n: 4 })
  })
  it('reports unlimited for scale, whatever the current plan', () => {
    expect(capDelta('starter', 'scale')).toEqual({ kind: 'unlimited' })
    expect(capDelta('growth', 'scale')).toEqual({ kind: 'unlimited' })
  })
  it('is zero for a same-plan pair', () => {
    expect(capDelta('growth', 'growth')).toEqual({ kind: 'more', n: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/billing/__tests__/upgrade.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/billing/upgrade"`.

- [ ] **Step 3: Write the implementation**

Create `lib/billing/upgrade.ts`:

```ts
import { PLAN_EXCHANGE_CAP } from './limits'
import { PLAN_KEYS, type PlanKey } from './plans'

// Plan ordering, low to high. Both the /billing/upgrade route (which refuses
// anything that is not strictly an upgrade) and the page (which decides which
// cards to render) read it, so "an upgrade" is defined in exactly one place.
export const PLAN_RANK: Record<PlanKey, number> = { starter: 0, growth: 1, scale: 2 }

export function upgradeTargets(current: PlanKey): PlanKey[] {
  return PLAN_KEYS.filter((k) => PLAN_RANK[k] > PLAN_RANK[current])
}

export function isUpgrade(current: PlanKey, target: PlanKey): boolean {
  return PLAN_RANK[target] > PLAN_RANK[current]
}

export type CapDelta = { kind: 'more'; n: number } | { kind: 'unlimited' }

// Derived from PLAN_EXCHANGE_CAP so it can never drift from the cap the
// createExchange gate actually enforces. The delta is the pitch on an upgrade
// card ("+4 échanges"), not the absolute number.
export function capDelta(current: PlanKey, target: PlanKey): CapDelta {
  const to = PLAN_EXCHANGE_CAP[target]
  if (to === Infinity) return { kind: 'unlimited' }
  return { kind: 'more', n: to - PLAN_EXCHANGE_CAP[current] }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/billing/__tests__/upgrade.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/upgrade.ts lib/billing/__tests__/upgrade.test.ts
git commit -m "feat(billing): plan ranking, upgrade targets and cap deltas"
```

---

## Task 2: Webhook resolves the plan from the price ID

Without this, an organizer pays the proration, the portal fires `customer.subscription.updated` with the *original* `metadata.plan`, and we write the old plan straight back. Their cap never moves and they have paid for nothing.

**Files:**
- Modify: `lib/billing/plans.ts` (append after `hasPriceForPlan`)
- Modify: `lib/billing/webhook.ts:38-51`
- Test: `lib/billing/__tests__/plans.test.ts` (append), `lib/billing/__tests__/webhook.test.ts` (append)

**Interfaces:**
- Produces: `planForPriceId(id: string): PlanKey | null` from `lib/billing/plans.ts`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing `planForPriceId` test**

Append inside the top-level `describe('plans', …)` block of `lib/billing/__tests__/plans.test.ts`, after the existing `describe('hasPriceForPlan / priceIdForPlan', …)` block:

```ts
  describe('planForPriceId', () => {
    const KEYS = ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_SCALE'] as const
    const originals = KEYS.map((k) => [k, process.env[k]] as const)
    afterEach(() => {
      for (const [k, v] of originals) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    })

    it('round-trips with priceIdForPlan', () => {
      process.env.STRIPE_PRICE_STARTER = 'price_s'
      process.env.STRIPE_PRICE_GROWTH = 'price_g'
      process.env.STRIPE_PRICE_SCALE = 'price_x'
      expect(planForPriceId(priceIdForPlan('starter'))).toBe('starter')
      expect(planForPriceId(priceIdForPlan('growth'))).toBe('growth')
      expect(planForPriceId(priceIdForPlan('scale'))).toBe('scale')
    })

    it('returns null for an unknown or empty price id', () => {
      process.env.STRIPE_PRICE_STARTER = 'price_s'
      expect(planForPriceId('price_nope')).toBeNull()
      expect(planForPriceId('')).toBeNull()
    })

    it('does not match a plan whose price env is unset', () => {
      delete process.env.STRIPE_PRICE_GROWTH
      expect(planForPriceId('price_g')).toBeNull()
    })
  })
```

Also extend that file's import list to pull in the new function — change the import block at the top of `lib/billing/__tests__/plans.test.ts` to:

```ts
import {
  PLAN_KEYS, DEFAULT_PLAN, isPlanKey, coercePlan, resolveCheckoutPlan,
  hasPriceForPlan, priceIdForPlan, planForPriceId,
} from '@/lib/billing/plans'
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/billing/__tests__/plans.test.ts`
Expected: FAIL — `planForPriceId is not a function` (or an import error).

- [ ] **Step 3: Implement `planForPriceId`**

Append to `lib/billing/plans.ts`, immediately after `hasPriceForPlan`:

```ts
// Server-only inverse of `priceIdForPlan`. The Stripe customer portal changes a
// subscription's PRICE without rewriting its metadata, so the webhook has to be
// able to name the plan from the price alone.
export function planForPriceId(id: string): PlanKey | null {
  if (!id) return null
  for (const key of PLAN_KEYS) {
    if (process.env[PRICE_ENV[key]] === id) return key
  }
  return null
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/billing/__tests__/plans.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing webhook tests**

Add these cases inside the existing `describe('resolveBillingUpdate', …)` in `lib/billing/__tests__/webhook.test.ts`, right after the `'subscription.updated without a valid plan omits plan from the patch'` case:

```ts
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
```

The file's vitest import must include `beforeEach` and `afterEach` — change line 1 of `lib/billing/__tests__/webhook.test.ts` to:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
```

- [ ] **Step 6: Run to verify the landmine case fails**

Run: `npx vitest run lib/billing/__tests__/webhook.test.ts`
Expected: FAIL — `prefers the price on the subscription over stale metadata`: expected `'growth'`, received `'starter'`.

- [ ] **Step 7: Fix the webhook**

In `lib/billing/webhook.ts`, change the import on line 3 to:

```ts
import { coercePlan, isPlanKey, planForPriceId } from './plans'
```

and replace line 49 (`if (isPlanKey(sub.metadata?.plan)) patch.plan = sub.metadata.plan`) with:

```ts
      // A customer-portal price change does NOT rewrite subscription metadata,
      // so metadata.plan stays at whatever the original checkout wrote. The
      // price actually on the subscription is the truth; metadata is only the
      // fallback for events that predate a configured price env.
      const priceId = sub.items?.data?.[0]?.price?.id
      const fromPrice = priceId ? planForPriceId(priceId) : null
      if (fromPrice) patch.plan = fromPrice
      else if (isPlanKey(sub.metadata?.plan)) patch.plan = sub.metadata.plan
```

`checkout.session.completed` is deliberately left alone — session metadata is correct there, and the first-purchase path must not change.

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run lib/billing/__tests__/webhook.test.ts lib/billing/__tests__/plans.test.ts`
Expected: PASS — the four new webhook cases plus every pre-existing case.

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 10: Commit**

```bash
git add lib/billing/plans.ts lib/billing/webhook.ts lib/billing/__tests__/plans.test.ts lib/billing/__tests__/webhook.test.ts
git commit -m "fix(billing): resolve plan from the subscription price, not stale metadata"
```

---

## Task 3: `GET /billing/upgrade` route

**Files:**
- Create: `app/billing/upgrade/route.ts`
- Test: `app/billing/__tests__/upgrade-route.test.ts`

**Interfaces:**
- Consumes: `isPlanKey`, `priceIdForPlan`, `hasPriceForPlan` from `lib/billing/plans.ts`; `hasActivePlan` from `lib/billing/limits.ts`; `isUpgrade` from `lib/billing/upgrade.ts`; `getStripe`, `isStripeConfigured` from `lib/billing/stripe.ts`.
- Produces: the route only. Linked to as `/billing/upgrade?plan=<growth|scale>` by `UpgradeOptions` (Task 6).

Guard order (each evaluated before any Stripe call):

| Condition | Action |
|---|---|
| no session | `/login` |
| `?plan=` is not a plan key | `/billing` |
| no profile / no school | `/login` |
| no customer id, no subscription id, or `!hasActivePlan` | `/billing/checkout?plan=X` (a trial school — checkout is the right route) |
| target does not outrank the current plan | `/billing` (upgrade-only; blocks hand-edited downgrade URLs) |
| Stripe unconfigured or price env missing | `/billing?error=unavailable` |
| Stripe throws | `/billing?error=unavailable` |

- [ ] **Step 1: Write the failing test**

Create `app/billing/__tests__/upgrade-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let user: { id: string } | null
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))

let profile: { school_id: string } | null
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
  profile = { school_id: 'sch_1' }
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/billing/__tests__/upgrade-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/billing/upgrade/route"`.

- [ ] **Step 3: Write the route**

Create `app/billing/upgrade/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'
import { isPlanKey, priceIdForPlan, hasPriceForPlan } from '@/lib/billing/plans'
import { hasActivePlan } from '@/lib/billing/limits'
import { isUpgrade } from '@/lib/billing/upgrade'

export const runtime = 'nodejs'

// Upgrading an EXISTING subscriber cannot go through /billing/checkout: a second
// `mode: 'subscription'` Checkout Session against the same customer creates a
// second, parallel subscription and a second charge. This route swaps the price
// on the current subscription item via a Stripe-hosted confirmation screen, so
// Stripe owns the proration, the card re-authentication and the receipt.
//
// PREREQUISITE (Stripe dashboard, not code): the customer portal configuration
// must have subscription updates enabled with all three prices listed under
// `features.subscription_update.products`, or `sessions.create` returns a 400
// and this route degrades to ?error=unavailable.
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const plan = request.nextUrl.searchParams.get('plan')
  if (!isPlanKey(plan)) return NextResponse.redirect(new URL('/billing', request.url))

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.redirect(new URL('/login', request.url))

  const { data: school } = await admin
    .from('schools')
    .select('stripe_customer_id, stripe_subscription_id, subscription_status, plan, grace_until')
    .eq('id', profile.school_id)
    .single()
  if (!school) return NextResponse.redirect(new URL('/login', request.url))

  // No subscription to modify — this is a trial school, and checkout is the
  // correct route for a first purchase.
  if (!school.stripe_customer_id || !school.stripe_subscription_id || !hasActivePlan(school)) {
    return NextResponse.redirect(new URL(`/billing/checkout?plan=${plan}`, request.url))
  }

  // Upgrade-only. Without this, a hand-edited URL would open a surprise
  // downgrade or a pointless same-plan confirmation.
  if (!school.plan || !isUpgrade(school.plan, plan)) {
    return NextResponse.redirect(new URL('/billing', request.url))
  }

  if (!isStripeConfigured() || !hasPriceForPlan(plan)) {
    return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
  }

  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(school.stripe_subscription_id)
    const itemId = sub.items.data[0]?.id
    if (!itemId) {
      console.error('[billing/upgrade] subscription has no items')
      return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: school.stripe_customer_id,
      return_url: `${appUrl}/billing`,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: school.stripe_subscription_id,
          items: [{ id: itemId, price: priceIdForPlan(plan), quantity: 1 }],
        },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: `${appUrl}/billing` },
        },
      },
    })
    return NextResponse.redirect(session.url, { status: 303 })
  } catch (err) {
    // Portal update flow not enabled, invalid key, Stripe outage. Log the API
    // message only (no PII) rather than surfacing a raw 500.
    console.error('[billing/upgrade] Stripe error:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(new URL('/billing?error=unavailable', request.url))
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/billing/__tests__/upgrade-route.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. If `flow_data` rejects `after_completion`, re-check the shape against `node_modules/stripe/cjs/resources/BillingPortal/Sessions.d.ts` → `SessionCreateParams.FlowData` (verified against `stripe@22.3.0`: `after_completion`, `subscription_update_confirm` and `type` are siblings under `flow_data`).

- [ ] **Step 6: Commit**

```bash
git add app/billing/upgrade/route.ts app/billing/__tests__/upgrade-route.test.ts
git commit -m "feat(billing): /billing/upgrade opens a Stripe subscription_update_confirm flow"
```

---

## Task 4: Message catalog — new `organizer.billing` keys in all five locales

Everything the new page renders, plus the copy currently hardcoded in French in `lib/billing/display.ts`. Insert each block **inside `organizer.billing`**, as a sibling of the existing `per` / `usage` / `usageUnlimited` / `plans` / `trial` / `payment` keys. Key order does not matter (the parity test sorts).

**Files:**
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `messages/__tests__/parity.test.ts` (append one anchor test)

**Interfaces:**
- Produces the keys consumed by Tasks 5–7: `heading`, `leadActive`, `leadTrial`, `unavailable`, `backToDashboard`, `managePortal`, `capLine`, `capUnlimited`, `popularBadge`, `selectorLegend`, `continueCta`, `upgradeCta`, `currentPlanBadge`, `cgv`, `audience.{starter,growth,scale}`, `features.{f1,f2,f3,f4}`, `delta.{more,unlimited}`, `capReached.{heading,body,blockedLead}`, `trialCapReached.{heading,body}`, `grace.{heading,body,cta}`.

- [ ] **Step 1: Add the French keys**

In `messages/fr.json`, inside `organizer.billing`, add:

```json
    "heading": "Offres & facturation",
    "leadActive": "Vous êtes sur l’offre {plan}.",
    "leadTrial": "Vous êtes en essai gratuit. Choisissez une offre pour créer plus d’échanges.",
    "unavailable": "Le paiement en ligne est momentanément indisponible. Merci de réessayer plus tard.",
    "backToDashboard": "Retour au tableau de bord",
    "managePortal": "Gérer ma facturation",
    "capLine": "{cap, plural, one {# échange} other {# échanges}}",
    "capUnlimited": "Échanges illimités",
    "popularBadge": "POPULAIRE",
    "selectorLegend": "Choix du forfait",
    "continueCta": "Continuer avec {plan}",
    "upgradeCta": "Passer à {plan}",
    "currentPlanBadge": "Offre actuelle",
    "cgv": "En souscrivant, vous acceptez nos <cgv>Conditions Générales de Vente</cgv>.",
    "audience": {
      "starter": "Pour un jumelage unique",
      "growth": "Pour plusieurs programmes en parallèle",
      "scale": "Pour les grands établissements"
    },
    "features": {
      "f1": "Élèves et familles illimités",
      "f2": "Formulaires et documents illimités",
      "f3": "Relances automatiques par e-mail",
      "f4": "Suivi des dossiers en temps réel"
    },
    "delta": {
      "more": "+{n, plural, one {# échange} other {# échanges}}",
      "unlimited": "Échanges illimités"
    },
    "capReached": {
      "heading": "Votre offre {plan} est complète",
      "body": "Vous utilisez vos {cap, plural, one {# échange} other {# échanges}}. Passez à l’offre supérieure pour en créer davantage.",
      "blockedLead": "Création d’échange bloquée : votre offre actuelle a atteint sa limite."
    },
    "trialCapReached": {
      "heading": "Votre essai gratuit est complet",
      "body": "Votre échange offert est utilisé. Choisissez une offre pour en créer davantage."
    },
    "grace": {
      "heading": "Votre dernier paiement a échoué",
      "body": "Mettez à jour votre carte pour conserver l’accès à vos échanges.",
      "cta": "Mettre à jour ma carte"
    },
```

- [ ] **Step 2: Run the apostrophe guard**

Run: `grep -o "'" messages/fr.json | wc -l`
Expected: `15` (unchanged from before this task). Anything higher means an ASCII `'` slipped in — replace it with `’`.

- [ ] **Step 3: Add the English keys**

In `messages/en.json`, inside `organizer.billing`:

```json
    "heading": "Plans & billing",
    "leadActive": "You’re on the {plan} plan.",
    "leadTrial": "You’re on the free trial. Choose a plan to create more exchanges.",
    "unavailable": "Online payment is temporarily unavailable. Please try again later.",
    "backToDashboard": "Back to dashboard",
    "managePortal": "Manage billing",
    "capLine": "{cap, plural, one {# exchange} other {# exchanges}}",
    "capUnlimited": "Unlimited exchanges",
    "popularBadge": "POPULAR",
    "selectorLegend": "Plan choice",
    "continueCta": "Continue with {plan}",
    "upgradeCta": "Upgrade to {plan}",
    "currentPlanBadge": "Current plan",
    "cgv": "By subscribing, you accept our <cgv>Terms of Sale</cgv>.",
    "audience": {
      "starter": "For a single partnership",
      "growth": "For several programs at once",
      "scale": "For large institutions"
    },
    "features": {
      "f1": "Unlimited students and families",
      "f2": "Unlimited forms and documents",
      "f3": "Automatic email reminders",
      "f4": "Real-time file tracking"
    },
    "delta": {
      "more": "+{n, plural, one {# exchange} other {# exchanges}}",
      "unlimited": "Unlimited exchanges"
    },
    "capReached": {
      "heading": "Your {plan} plan is full",
      "body": "You’re using all {cap, plural, one {# exchange} other {# exchanges}}. Upgrade to create more.",
      "blockedLead": "Exchange creation blocked: your current plan has reached its limit."
    },
    "trialCapReached": {
      "heading": "Your free trial is full",
      "body": "Your free exchange is in use. Choose a plan to create more."
    },
    "grace": {
      "heading": "Your last payment failed",
      "body": "Update your card to keep access to your exchanges.",
      "cta": "Update my card"
    },
```

- [ ] **Step 4: Add the Spanish keys**

In `messages/es.json`, inside `organizer.billing`:

```json
    "heading": "Planes y facturación",
    "leadActive": "Tienes el plan {plan}.",
    "leadTrial": "Estás en la prueba gratuita. Elige un plan para crear más intercambios.",
    "unavailable": "El pago en línea no está disponible temporalmente. Inténtalo de nuevo más tarde.",
    "backToDashboard": "Volver al panel",
    "managePortal": "Gestionar la facturación",
    "capLine": "{cap, plural, one {# intercambio} other {# intercambios}}",
    "capUnlimited": "Intercambios ilimitados",
    "popularBadge": "POPULAR",
    "selectorLegend": "Elección de plan",
    "continueCta": "Continuar con {plan}",
    "upgradeCta": "Cambiar a {plan}",
    "currentPlanBadge": "Plan actual",
    "cgv": "Al suscribirte, aceptas nuestras <cgv>Condiciones Generales de Venta</cgv>.",
    "audience": {
      "starter": "Para un hermanamiento único",
      "growth": "Para varios programas en paralelo",
      "scale": "Para grandes centros educativos"
    },
    "features": {
      "f1": "Alumnos y familias ilimitados",
      "f2": "Formularios y documentos ilimitados",
      "f3": "Recordatorios automáticos por correo",
      "f4": "Seguimiento de expedientes en tiempo real"
    },
    "delta": {
      "more": "+{n, plural, one {# intercambio} other {# intercambios}}",
      "unlimited": "Intercambios ilimitados"
    },
    "capReached": {
      "heading": "Tu plan {plan} está completo",
      "body": "Estás usando tus {cap, plural, one {# intercambio} other {# intercambios}}. Cambia a un plan superior para crear más.",
      "blockedLead": "Creación de intercambio bloqueada: tu plan actual ha alcanzado su límite."
    },
    "trialCapReached": {
      "heading": "Tu prueba gratuita está completa",
      "body": "Tu intercambio gratuito está en uso. Elige un plan para crear más."
    },
    "grace": {
      "heading": "Tu último pago ha fallado",
      "body": "Actualiza tu tarjeta para conservar el acceso a tus intercambios.",
      "cta": "Actualizar mi tarjeta"
    },
```

- [ ] **Step 5: Add the Italian keys**

In `messages/it.json`, inside `organizer.billing`:

```json
    "heading": "Piani e fatturazione",
    "leadActive": "Hai il piano {plan}.",
    "leadTrial": "Sei in prova gratuita. Scegli un piano per creare altri scambi.",
    "unavailable": "Il pagamento online non è momentaneamente disponibile. Riprova più tardi.",
    "backToDashboard": "Torna alla dashboard",
    "managePortal": "Gestisci la fatturazione",
    "capLine": "{cap, plural, one {# scambio} other {# scambi}}",
    "capUnlimited": "Scambi illimitati",
    "popularBadge": "POPOLARE",
    "selectorLegend": "Scelta del piano",
    "continueCta": "Continua con {plan}",
    "upgradeCta": "Passa a {plan}",
    "currentPlanBadge": "Piano attuale",
    "cgv": "Sottoscrivendo, accetti le nostre <cgv>Condizioni Generali di Vendita</cgv>.",
    "audience": {
      "starter": "Per un gemellaggio singolo",
      "growth": "Per più programmi in parallelo",
      "scale": "Per i grandi istituti"
    },
    "features": {
      "f1": "Studenti e famiglie illimitati",
      "f2": "Moduli e documenti illimitati",
      "f3": "Solleciti automatici via e-mail",
      "f4": "Monitoraggio delle pratiche in tempo reale"
    },
    "delta": {
      "more": "+{n, plural, one {# scambio} other {# scambi}}",
      "unlimited": "Scambi illimitati"
    },
    "capReached": {
      "heading": "Il tuo piano {plan} è al completo",
      "body": "Stai usando tutti i tuoi {cap, plural, one {# scambio} other {# scambi}}. Passa a un piano superiore per crearne altri.",
      "blockedLead": "Creazione dello scambio bloccata: il tuo piano attuale ha raggiunto il limite."
    },
    "trialCapReached": {
      "heading": "La tua prova gratuita è al completo",
      "body": "Il tuo scambio gratuito è già in uso. Scegli un piano per crearne altri."
    },
    "grace": {
      "heading": "Il tuo ultimo pagamento non è andato a buon fine",
      "body": "Aggiorna la tua carta per mantenere l’accesso ai tuoi scambi.",
      "cta": "Aggiorna la mia carta"
    },
```

- [ ] **Step 6: Add the German keys**

In `messages/de.json`, inside `organizer.billing`:

```json
    "heading": "Tarife & Abrechnung",
    "leadActive": "Sie nutzen den Tarif {plan}.",
    "leadTrial": "Sie befinden sich in der kostenlosen Testphase. Wählen Sie einen Tarif, um weitere Austausche anzulegen.",
    "unavailable": "Die Online-Zahlung ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.",
    "backToDashboard": "Zurück zum Dashboard",
    "managePortal": "Abrechnung verwalten",
    "capLine": "{cap, plural, one {# Austausch} other {# Austausche}}",
    "capUnlimited": "Unbegrenzte Austausche",
    "popularBadge": "BELIEBT",
    "selectorLegend": "Tarifauswahl",
    "continueCta": "Weiter mit {plan}",
    "upgradeCta": "Wechseln zu {plan}",
    "currentPlanBadge": "Aktueller Tarif",
    "cgv": "Mit dem Abonnement akzeptieren Sie unsere <cgv>Allgemeinen Verkaufsbedingungen</cgv>.",
    "audience": {
      "starter": "Für eine einzelne Partnerschaft",
      "growth": "Für mehrere Programme parallel",
      "scale": "Für große Einrichtungen"
    },
    "features": {
      "f1": "Unbegrenzt Schüler und Familien",
      "f2": "Unbegrenzt Formulare und Dokumente",
      "f3": "Automatische E-Mail-Erinnerungen",
      "f4": "Aktenverfolgung in Echtzeit"
    },
    "delta": {
      "more": "+{n, plural, one {# Austausch} other {# Austausche}}",
      "unlimited": "Unbegrenzte Austausche"
    },
    "capReached": {
      "heading": "Ihr Tarif {plan} ist ausgeschöpft",
      "body": "Sie nutzen alle {cap, plural, one {# Austausch} other {# Austausche}}. Wechseln Sie in einen höheren Tarif, um weitere anzulegen.",
      "blockedLead": "Anlegen eines Austauschs blockiert: Ihr aktueller Tarif hat sein Limit erreicht."
    },
    "trialCapReached": {
      "heading": "Ihre kostenlose Testphase ist ausgeschöpft",
      "body": "Ihr kostenloser Austausch wird bereits genutzt. Wählen Sie einen Tarif, um weitere anzulegen."
    },
    "grace": {
      "heading": "Ihre letzte Zahlung ist fehlgeschlagen",
      "body": "Aktualisieren Sie Ihre Karte, um den Zugang zu Ihren Austauschen zu behalten.",
      "cta": "Karte aktualisieren"
    },
```

- [ ] **Step 7: Add the anchor test**

Append inside the top-level `describe('message catalog parity', …)` of `messages/__tests__/parity.test.ts`, after the `'the organizer sidebar keys exist and are not abbreviated'` case:

```ts
  it('the billing upgrade keys exist in French with their ICU arguments', () => {
    const fl = leaves(fr)
    expect(fl['organizer.billing.capReached.heading']).toBe('Votre offre {plan} est complète')
    expect(fl['organizer.billing.capReached.blockedLead'])
      .toBe('Création d’échange bloquée : votre offre actuelle a atteint sa limite.')
    expect(fl['organizer.billing.upgradeCta']).toBe('Passer à {plan}')
    expect(fl['organizer.billing.currentPlanBadge']).toBe('Offre actuelle')
    expect(fl['organizer.billing.delta.more']).toBe('+{n, plural, one {# échange} other {# échanges}}')
    expect(fl['organizer.billing.delta.unlimited']).toBe('Échanges illimités')
    expect(fl['organizer.billing.grace.cta']).toBe('Mettre à jour ma carte')
    expect(fl['organizer.billing.cgv']).toContain('<cgv>')
  })
```

- [ ] **Step 8: Run the parity suite**

Run: `npx vitest run messages/__tests__/parity.test.ts`
Expected: PASS — every locale has the exact same key set as `fr`, no empty values, matching ICU argument sets, and the new anchor test passes. A `has the exact same key set as fr` failure names the locale that is missing a key.

- [ ] **Step 9: Re-run the apostrophe guard and type-check**

Run: `grep -o "'" messages/fr.json | wc -l && npx tsc --noEmit`
Expected: `15`, then no `tsc` output.

- [ ] **Step 10: Commit**

```bash
git add messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json messages/__tests__/parity.test.ts
git commit -m "i18n(billing): plan copy, cap-reached and upgrade keys in all five locales"
```

---

## Task 5: `PlanCard` + `plan-copy` + translated `PlanSelector`

Extracting the card is what stops the trial selector and the upgrade cards from duplicating markup and drifting visually. `PlanCard` takes **only strings** — no `useTranslations`, no `getTranslations` — so the same component works inside the client selector and inside the async server `UpgradeOptions`.

**Files:**
- Create: `components/billing/PlanCard.tsx`, `lib/billing/plan-copy.ts`
- Test: `lib/billing/__tests__/plan-copy.test.ts`
- Modify: `components/billing/PlanSelector.tsx`, `components/billing/__tests__/PlanSelector.test.tsx`

**Interfaces:**
- Consumes: `AppTranslator`, `asAppTranslator` from `lib/i18n/messages.ts`; `capDelta` from `lib/billing/upgrade.ts`; `PLAN_EXCHANGE_CAP` from `lib/billing/limits.ts`; the Task 4 message keys.
- Produces:
  - `PlanCard(props: PlanCardProps)` from `components/billing/PlanCard.tsx`, where
    `PlanCardProps = { label: string; price: string; per: string; capLine: string; audience: string; features: string[]; badge?: ReactNode; cta?: ReactNode; selected?: boolean; cardRef?: Ref<HTMLDivElement> } & HTMLAttributes<HTMLDivElement>`
  - `type PlanCopy = { label: string; price: string; per: string; audience: string; capLine: string }`
  - `planCopy(t: AppTranslator, key: PlanKey): PlanCopy`
  - `featureBullets(t: AppTranslator): string[]`
  - `deltaLabel(t: AppTranslator, current: PlanKey, target: PlanKey): string`
  - **The `AppTranslator` passed to all three must be scoped to the `organizer.billing` namespace.**

- [ ] **Step 1: Write the failing `plan-copy` test**

Create `lib/billing/__tests__/plan-copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import { asAppTranslator } from '@/lib/i18n/messages'
import { planCopy, featureBullets, deltaLabel } from '@/lib/billing/plan-copy'

const t = asAppTranslator(
  createTranslator({ locale: 'fr', messages: fr, namespace: 'organizer.billing' } as never),
)

describe('planCopy', () => {
  it('resolves label, price, per, audience and a bounded cap line', () => {
    expect(planCopy(t, 'starter')).toEqual({
      label: 'Essentiel',
      price: '199 €',
      per: '/ an',
      audience: 'Pour un jumelage unique',
      capLine: '2 échanges',
    })
  })
  it('uses the unlimited cap line for scale', () => {
    expect(planCopy(t, 'scale').capLine).toBe('Échanges illimités')
    expect(planCopy(t, 'scale').label).toBe('Réseau')
  })
  it('pluralises a cap of one', () => {
    // growth is 6 — assert the plural arm is wired by checking the 6-form.
    expect(planCopy(t, 'growth').capLine).toBe('6 échanges')
  })
})

describe('featureBullets', () => {
  it('returns the four shared bullets', () => {
    expect(featureBullets(t)).toEqual([
      'Élèves et familles illimités',
      'Formulaires et documents illimités',
      'Relances automatiques par e-mail',
      'Suivi des dossiers en temps réel',
    ])
  })
})

describe('deltaLabel', () => {
  it('prices an upgrade by the capacity it adds', () => {
    expect(deltaLabel(t, 'starter', 'growth')).toBe('+4 échanges')
  })
  it('says unlimited for scale', () => {
    expect(deltaLabel(t, 'starter', 'scale')).toBe('Échanges illimités')
    expect(deltaLabel(t, 'growth', 'scale')).toBe('Échanges illimités')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/billing/__tests__/plan-copy.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/billing/plan-copy"`.

- [ ] **Step 3: Write `lib/billing/plan-copy.ts`**

```ts
import type { AppTranslator } from '@/lib/i18n/messages'
import { PLAN_EXCHANGE_CAP } from './limits'
import type { PlanKey } from './plans'
import { capDelta } from './upgrade'

// All plan copy lives in the `organizer.billing` message namespace. These
// helpers take an AppTranslator ALREADY scoped to that namespace so the same
// strings serve the client selector (useTranslations) and the server upgrade
// cards (getTranslations) without duplication.
//
// AppTranslator intentionally erases next-intl's literal key union — the
// documented escape hatch (lib/i18n/messages.ts). A wrong key would slip past
// the compiler, so plan-copy.test.ts asserts every one against the real French
// catalog and the parity gate keeps the other four locales in step.

export type PlanCopy = {
  label: string
  price: string
  per: string
  audience: string
  capLine: string
}

export function planCopy(t: AppTranslator, key: PlanKey): PlanCopy {
  const cap = PLAN_EXCHANGE_CAP[key]
  return {
    label: t(`plans.${key}.label`),
    price: t(`plans.${key}.price`),
    per: t('per'),
    audience: t(`audience.${key}`),
    capLine: cap === Infinity ? t('capUnlimited') : t('capLine', { cap }),
  }
}

export function featureBullets(t: AppTranslator): string[] {
  return [t('features.f1'), t('features.f2'), t('features.f3'), t('features.f4')]
}

// The pitch on an upgrade card: "+4 échanges", not "6 échanges".
export function deltaLabel(t: AppTranslator, current: PlanKey, target: PlanKey): string {
  const d = capDelta(current, target)
  return d.kind === 'unlimited' ? t('delta.unlimited') : t('delta.more', { n: d.n })
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/billing/__tests__/plan-copy.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write `components/billing/PlanCard.tsx`**

No `'use client'` directive — the component is neutral and gets bundled into whichever tree imports it.

```tsx
import type { HTMLAttributes, ReactNode, Ref } from 'react'

export type PlanCardProps = {
  label: string
  price: string
  per: string
  capLine: string
  audience: string
  features: string[]
  /** Absolute-positioned pill in the top-left notch (POPULAIRE, "+4 échanges"). */
  badge?: ReactNode
  /** Per-card call to action, rendered at the bottom. */
  cta?: ReactNode
  selected?: boolean
  cardRef?: Ref<HTMLDivElement>
} & HTMLAttributes<HTMLDivElement>

// Presentational only: every string arrives as a prop, so the same card renders
// inside the client-side PlanSelector and the async server UpgradeOptions.
export function PlanCard({
  label, price, per, capLine, audience, features,
  badge, cta, selected = false, cardRef, className = '', ...rest
}: PlanCardProps) {
  return (
    <div
      ref={cardRef}
      className={`relative flex flex-col gap-1.5 rounded-[14px] border p-5 text-left ${
        selected ? 'border-2 border-[#2456E6] bg-[#F7F9FE]' : 'border-[#C4CDE0]'
      } ${className}`}
      {...rest}
    >
      {badge}
      <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-[#10203F]">{label}</span>
      <span className="text-[15px] font-semibold text-[#10203F]">
        {price} <span className="text-[13px] font-normal text-[#5B6B8C]">{per}</span>
      </span>
      <span className="text-[13.5px] text-[#5B6B8C]">{capLine}</span>
      <span className="mt-1.5 text-[13px] font-semibold text-[#10203F]">{audience}</span>
      <ul className="mt-2 flex flex-col gap-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-[#5B6B8C]">
            <span aria-hidden className="mt-[1px] text-[#2456E6]">✓</span>
            {f}
          </li>
        ))}
      </ul>
      {cta}
    </div>
  )
}
```

- [ ] **Step 6: Rewrite `components/billing/PlanSelector.tsx`**

Replace the whole file. The radiogroup, arrow-key navigation and POPULAIRE badge behaviour are unchanged — only the markup source and the copy source move.

```tsx
'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PLAN_KEYS, type PlanKey } from '@/lib/billing/plans'
import { planCopy, featureBullets } from '@/lib/billing/plan-copy'
import { asAppTranslator } from '@/lib/i18n/messages'
import { PlanCard } from './PlanCard'

export function PlanSelector() {
  const t = asAppTranslator(useTranslations('organizer.billing'))
  const [selected, setSelected] = useState<PlanKey>('growth')
  const cardRefs = useRef<Partial<Record<PlanKey, HTMLDivElement | null>>>({})
  // Move selection to an adjacent card and follow it with focus (radiogroup arrow-key behavior).
  const move = (key: PlanKey, delta: number) => {
    const next = PLAN_KEYS[(PLAN_KEYS.indexOf(key) + delta + PLAN_KEYS.length) % PLAN_KEYS.length]
    setSelected(next)
    cardRefs.current[next]?.focus()
  }
  const features = featureBullets(t)
  return (
    <>
      <div role="radiogroup" aria-label={t('selectorLegend')} className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {PLAN_KEYS.map((key) => {
          const active = key === selected
          const copy = planCopy(t, key)
          return (
            <PlanCard
              key={key}
              cardRef={(el) => { cardRefs.current[key] = el }}
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(key)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelected(key) }
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(key, 1) }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(key, -1) }
              }}
              className={active ? 'cursor-pointer' : 'cursor-pointer hover:border-[#2456E6]'}
              selected={active}
              label={copy.label}
              price={copy.price}
              per={copy.per}
              capLine={copy.capLine}
              audience={copy.audience}
              features={features}
              badge={key === 'growth' ? (
                <span className="absolute -top-2.5 left-4 rounded-full bg-[#2456E6] px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-white">
                  {t('popularBadge')}
                </span>
              ) : undefined}
            />
          )
        })}
      </div>
      <div className="flex gap-3">
        <Link href={`/billing/checkout?plan=${selected}`} className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">
          {t('continueCta', { plan: planCopy(t, selected).label })}
        </Link>
        <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">
          {t('backToDashboard')}
        </Link>
      </div>
    </>
  )
}
```

- [ ] **Step 7: Update the `PlanSelector` test to render under the intl provider**

`PlanSelector` now needs a `NextIntlClientProvider`. In `components/billing/__tests__/PlanSelector.test.tsx`, replace lines 1–4 (the imports) with:

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { PlanSelector } from '@/components/billing/PlanSelector'
```

then replace every `render(<PlanSelector />)` in the file with `renderWithIntl(<PlanSelector />)` (5 occurrences). Every assertion stays as-is: the French strings are identical to the retired `display.ts` values.

- [ ] **Step 8: Run the component tests**

Run: `npx vitest run components/billing/__tests__/PlanSelector.test.tsx lib/billing/__tests__/plan-copy.test.ts`
Expected: PASS — all 5 PlanSelector tests plus the 6 plan-copy tests.

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. (`lib/billing/display.ts` is still intact at this point, so `app/billing/page.tsx` still compiles.)

- [ ] **Step 10: Commit**

```bash
git add components/billing/PlanCard.tsx components/billing/PlanSelector.tsx components/billing/__tests__/PlanSelector.test.tsx lib/billing/plan-copy.ts lib/billing/__tests__/plan-copy.test.ts
git commit -m "refactor(billing): extract PlanCard and translate the plan selector"
```

---

## Task 6: `UpgradeOptions`

**Files:**
- Create: `components/billing/UpgradeOptions.tsx`
- Test: `components/billing/__tests__/UpgradeOptions.test.tsx`

**Interfaces:**
- Consumes: `PlanCard`; `upgradeTargets` from `lib/billing/upgrade.ts`; `planCopy` / `featureBullets` / `deltaLabel` from `lib/billing/plan-copy.ts`; `getTranslations` from `next-intl/server`.
- Produces: `UpgradeOptions({ current }: { current: PlanKey })` — an **async** Server Component. Returns `null` when `upgradeTargets(current)` is empty (i.e. on `scale`), so the page needs no special case for the top tier.

No selection state: with at most two cards pointing at two different routes, a radiogroup buys nothing.

- [ ] **Step 1: Write the failing test**

Create `components/billing/__tests__/UpgradeOptions.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import { UpgradeOptions } from '@/components/billing/UpgradeOptions'

describe('UpgradeOptions', () => {
  it('offers both higher tiers to a starter subscriber, each with its own CTA', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'starter' })}</>)
    expect(screen.getByRole('link', { name: 'Passer à Association' }))
      .toHaveAttribute('href', '/billing/upgrade?plan=growth')
    expect(screen.getByRole('link', { name: 'Passer à Réseau' }))
      .toHaveAttribute('href', '/billing/upgrade?plan=scale')
  })

  it('prices each card by the capacity it adds, not the absolute cap', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'starter' })}</>)
    expect(screen.getByText('+4 échanges')).toBeInTheDocument()
    expect(screen.getAllByText('Échanges illimités').length).toBeGreaterThan(0)
  })

  it('offers only scale to a growth subscriber', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'growth' })}</>)
    expect(screen.getByRole('link', { name: 'Passer à Réseau' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Passer à Association' })).toBeNull()
  })

  it('renders nothing on the top plan', async () => {
    const { container } = renderWithIntl(<>{await UpgradeOptions({ current: 'scale' })}</>)
    expect(container.textContent).toBe('')
  })

  it('shows the shared feature bullets on every card', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'starter' })}</>)
    expect(screen.getAllByText('Relances automatiques par e-mail')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/billing/__tests__/UpgradeOptions.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/billing/UpgradeOptions"`.

- [ ] **Step 3: Write the component**

Create `components/billing/UpgradeOptions.tsx`:

```tsx
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { asAppTranslator } from '@/lib/i18n/messages'
import type { PlanKey } from '@/lib/billing/plans'
import { upgradeTargets } from '@/lib/billing/upgrade'
import { planCopy, featureBullets, deltaLabel } from '@/lib/billing/plan-copy'
import { PlanCard } from './PlanCard'

// The paid path. `upgradeTargets` is empty on the top plan, so `scale` needs no
// special case anywhere — this simply renders nothing.
export async function UpgradeOptions({ current }: { current: PlanKey }) {
  const t = asAppTranslator(await getTranslations('organizer.billing'))
  const targets = upgradeTargets(current)
  if (targets.length === 0) return null
  const features = featureBullets(t)

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {targets.map((key) => {
        const copy = planCopy(t, key)
        return (
          <PlanCard
            key={key}
            label={copy.label}
            price={copy.price}
            per={copy.per}
            capLine={copy.capLine}
            audience={copy.audience}
            features={features}
            badge={
              <span className="absolute -top-2.5 left-4 rounded-full bg-[#2456E6] px-2.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-white">
                {deltaLabel(t, current, key)}
              </span>
            }
            cta={
              <Link
                href={`/billing/upgrade?plan=${key}`}
                className="mt-4 flex items-center justify-center rounded-[11px] bg-[#2456E6] py-3 text-[15px] font-semibold text-white hover:bg-[#1D48C7]"
              >
                {t('upgradeCta', { plan: copy.label })}
              </Link>
            }
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/billing/__tests__/UpgradeOptions.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add components/billing/UpgradeOptions.tsx components/billing/__tests__/UpgradeOptions.test.tsx
git commit -m "feat(billing): upgrade cards priced by the capacity they add"
```

---

## Task 7: `/billing` page — usage, state matrix, `?reason=limit`, i18n

**Files:**
- Modify: `app/billing/page.tsx` (full rewrite), `lib/billing/display.ts` (add `usagePct`)
- Test: `app/billing/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `PlanSelector`, `UpgradeOptions`, `planCopy`, `hasActivePlan` / `isInGrace` / `exchangeCap` / `TRIAL_EXCHANGE_CAP`, `resolveLocale`, `loadMessages` / `pickNamespaces` / `asAppTranslator`.
- Produces: `usagePct(used: number, cap: number): number` in `lib/billing/display.ts`. Added **additively** here (`usageLine` stays until Task 8) so the page and `actions/settings.ts` both keep compiling at every commit.

State matrix, first match wins:

| # | Condition | Renders |
|---|---|---|
| 1 | `isInGrace(school)` | Payment-failed heading/body, primary CTA « Mettre à jour ma carte » → `/billing/portal`. **Upgrade cards suppressed** — `subscription_update_confirm` against a declining card is a poor flow, and asking someone to spend *more* while their payment is failing is the wrong ask. |
| 2 | `!hasActivePlan(school)` | Trial. Usage bar + all three cards via `<PlanSelector />` → `/billing/checkout?plan=X` |
| 3 | `hasActivePlan(school)` | Usage bar + `<UpgradeOptions />` → `/billing/upgrade?plan=X` |

Urgency is driven by **`atCap`**, not by the query param, so an organizer sitting at 2/2 who navigates from Settings sees the same honest framing as one who was just blocked. `?reason=limit` adds exactly one extra lead-in sentence.

- [ ] **Step 1: Write the failing test**

Create `app/billing/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@testing-library/react'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)
vi.mock('@/lib/i18n/resolve', () => ({ resolveLocale: async () => 'fr' }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error('REDIRECT:' + url) },
}))

let user: { id: string } | null
let profile: { school_id: string; role: string } | null
let school: Record<string, unknown> | null
let exchangeCount: number

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }
      }
      if (table === 'schools') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: school }) }) }) }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: async () => ({ count: exchangeCount }) }) }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

import BillingPage from '@/app/billing/page'

async function renderPage(sp: Record<string, string> = {}) {
  render(await BillingPage({ searchParams: Promise.resolve(sp) }))
}

const PAID_STARTER = {
  subscription_status: 'active', plan: 'starter',
  grace_until: null, stripe_customer_id: 'cus_1',
}

beforeEach(() => {
  user = { id: 'u1' }
  profile = { school_id: 'sch_1', role: 'organizer' }
  school = { ...PAID_STARTER }
  exchangeCount = 0
})

describe('/billing', () => {
  it('shows the neutral heading and the current-plan badge below the cap', async () => {
    exchangeCount = 1
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Offres & facturation' })).toBeInTheDocument()
    expect(screen.getByText(/Offre actuelle/)).toBeInTheDocument()
    expect(screen.getByText('1 / 2 échanges utilisé')).toBeInTheDocument()
  })

  it('flips to the cap-reached framing at the cap, with no query param needed', async () => {
    exchangeCount = 2
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Votre offre Essentiel est complète' })).toBeInTheDocument()
    expect(screen.queryByText(/Création d’échange bloquée/)).toBeNull()
  })

  it('acknowledges the blocked action when arriving with ?reason=limit', async () => {
    exchangeCount = 2
    await renderPage({ reason: 'limit' })
    expect(screen.getByText('Création d’échange bloquée : votre offre actuelle a atteint sa limite.'))
      .toBeInTheDocument()
  })

  it('offers the higher tiers to a paid subscriber', async () => {
    exchangeCount = 2
    await renderPage()
    expect(screen.getByRole('link', { name: 'Passer à Association' }))
      .toHaveAttribute('href', '/billing/upgrade?plan=growth')
    expect(screen.getByRole('link', { name: 'Gérer ma facturation' }))
      .toHaveAttribute('href', '/billing/portal')
  })

  it('renders no upgrade cards on the top plan, only the usage and the portal link', async () => {
    school = { ...PAID_STARTER, plan: 'scale' }
    exchangeCount = 9
    await renderPage()
    expect(screen.queryByRole('link', { name: /^Passer à/ })).toBeNull()
    expect(screen.getByText('9 échanges actifs · échanges illimités')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gérer ma facturation' })).toBeInTheDocument()
  })

  it('suppresses upgrades during the payment grace period', async () => {
    school = {
      subscription_status: 'past_due', plan: 'starter',
      grace_until: new Date(Date.now() + 86_400_000).toISOString(),
      stripe_customer_id: 'cus_1',
    }
    exchangeCount = 2
    await renderPage({ reason: 'limit' })
    expect(screen.getByRole('heading', { name: 'Votre dernier paiement a échoué' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mettre à jour ma carte' }))
      .toHaveAttribute('href', '/billing/portal')
    expect(screen.queryByRole('link', { name: /^Passer à/ })).toBeNull()
    expect(screen.queryByText(/Création d’échange bloquée/)).toBeNull()
  })

  it('shows all three plans plus the CGV line to a trial school', async () => {
    school = { subscription_status: null, plan: null, grace_until: null, stripe_customer_id: null }
    exchangeCount = 1
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Votre essai gratuit est complet' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conditions Générales de Vente' }))
      .toHaveAttribute('href', '/legal/cgv')
  })

  it('surfaces the unavailable notice', async () => {
    await renderPage({ error: 'unavailable' })
    expect(screen.getByText(/momentanément indisponible/)).toBeInTheDocument()
  })

  it('sends a non-organizer to /my-forms', async () => {
    profile = { school_id: 'sch_1', role: 'student' }
    await expect(renderPage()).rejects.toThrow('REDIRECT:/my-forms')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/billing/__tests__/page.test.tsx`
Expected: FAIL — the current page has no exchange count, no usage bar, no upgrade cards and no translated headings.

- [ ] **Step 3: Add `usagePct` to `lib/billing/display.ts` (additive)**

Append to `lib/billing/display.ts`, leaving `usageLine` and everything else in place for now — Task 8 does the deletion, once nothing reads the copy:

```ts
// Width of the usage bar. Unlimited plans get a token sliver rather than a
// meaningless 0% or 100%.
export function usagePct(used: number, cap: number): number {
  if (cap === Infinity) return 6
  return cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
}
```

- [ ] **Step 4: Rewrite `app/billing/page.tsx`**

Replace the whole file:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { hasActivePlan, isInGrace, exchangeCap, TRIAL_EXCHANGE_CAP } from '@/lib/billing/limits'
import { isPlanKey } from '@/lib/billing/plans'
import { usagePct } from '@/lib/billing/display'
import { planCopy } from '@/lib/billing/plan-copy'
import { asAppTranslator, loadMessages, pickNamespaces } from '@/lib/i18n/messages'
import { resolveLocale } from '@/lib/i18n/resolve'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { PlanSelector } from '@/components/billing/PlanSelector'
import { UpgradeOptions } from '@/components/billing/UpgradeOptions'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>
}) {
  const { error, reason } = await searchParams
  const unavailable = error === 'unavailable'
  const blocked = reason === 'limit'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Own profile + own school: RLS covers both reads — no service role needed.
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const { data: school } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()

  // Same rule as getBillingOverview (actions/settings.ts): a school owns the
  // exchanges it created, where it is always school_a. Counting differently
  // here would let /billing and Settings disagree about the same number.
  const { count } = await supabase
    .from('exchanges').select('id', { count: 'exact', head: true })
    .eq('school_a_id', profile.school_id)
  const used = count ?? 0

  const grace = school ? isInGrace(school) : false
  const active = school ? hasActivePlan(school) : false
  const planKey = active && school && isPlanKey(school.plan) ? school.plan : null
  const cap = school ? exchangeCap(school) : TRIAL_EXCHANGE_CAP
  const atCap = used >= cap

  const locale = await resolveLocale()
  // /billing lives outside the (organizer) group, so it mounts its own provider
  // for the client-side PlanSelector. Only the namespaces this page needs.
  const messages = pickNamespaces(await loadMessages(locale), ['common', 'organizer'])
  const tRaw = await getTranslations('organizer.billing')
  const t = asAppTranslator(tRaw)

  const planLabel = planKey ? planCopy(t, planKey).label : ''
  const usageLabel = cap === Infinity ? t('usageUnlimited', { used }) : t('usage', { used, cap })

  // Urgency follows atCap, not the query param, so a bookmark or a Settings
  // click at 2/2 reads exactly like a blocked "+ Nouvel échange".
  const heading = grace
    ? t('grace.heading')
    : atCap
      ? (planKey ? t('capReached.heading', { plan: planLabel }) : t('trialCapReached.heading'))
      : t('heading')
  const lead = grace
    ? t('grace.body')
    : atCap
      ? (planKey ? t('capReached.body', { cap }) : t('trialCapReached.body'))
      : (planKey ? t('leadActive', { plan: planLabel }) : t('leadTrial'))

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale}>
        <CenteredCard maxWidth={planKey && !grace ? 720 : 640} className="flex flex-col gap-[22px]">
          {unavailable && (
            <p className="m-0 rounded-[11px] bg-[#FDECEA] px-4 py-3 text-sm text-[#C0392B]">
              {t('unavailable')}
            </p>
          )}

          <div>
            <h3 className="m-0 mb-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">{heading}</h3>
            {blocked && !grace && (
              <p className="m-0 mb-1.5 text-[15px] font-semibold leading-[1.55] text-[#10203F]">
                {t('capReached.blockedLead')}
              </p>
            )}
            <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">{lead}</p>
          </div>

          {school && (
            <div className="rounded-xl border border-[#C4CDE0] px-5 py-[18px]">
              {planKey && (
                <span className="rounded-full bg-[#EEF3FE] px-2.5 py-[3px] text-[11px] font-semibold text-[#2456E6]">
                  {t('currentPlanBadge')} · {planLabel}
                </span>
              )}
              <div className={`mb-[5px] h-1.5 overflow-hidden rounded-full bg-[#EEF1F7] ${planKey ? 'mt-3' : ''}`}>
                <div className="h-full rounded-full bg-[#2456E6]" style={{ width: `${usagePct(used, cap)}%` }} />
              </div>
              <div className="font-mono text-[11px] font-medium text-[#8A97B2]">{usageLabel}</div>
            </div>
          )}

          {grace ? (
            // Fix the card first, upgrade after: subscription_update_confirm
            // against a declining card is a poor flow, and asking for more money
            // mid-failure is the wrong ask.
            <div className="flex gap-3">
              <Link href="/billing/portal" className="flex flex-1 items-center justify-center rounded-[11px] bg-[#2456E6] py-3.5 text-base font-semibold text-white hover:bg-[#1D48C7]">
                {t('grace.cta')}
              </Link>
              <Link href="/dashboard" className="flex items-center justify-center rounded-[11px] px-[18px] py-3.5 text-[15px] font-semibold text-[#5B6B8C] hover:text-[#10203F]">
                {t('backToDashboard')}
              </Link>
            </div>
          ) : planKey ? (
            <>
              {/* Empty on `scale` — no special case needed for the top tier. */}
              <UpgradeOptions current={planKey} />
              <div className="flex items-center justify-center gap-5">
                <Link href="/billing/portal" className="text-sm font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
                  {t('managePortal')}
                </Link>
                <Link href="/dashboard" className="text-sm font-semibold text-[#5B6B8C] hover:text-[#10203F]">
                  {t('backToDashboard')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <PlanSelector />
              {school?.stripe_customer_id && (
                <Link href="/billing/portal" className="text-center text-sm font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
                  {t('managePortal')}
                </Link>
              )}
              <p className="m-0 text-center text-xs leading-[1.5] text-[#8A97B2]">
                {tRaw.rich('cgv', {
                  cgv: (chunks) => (
                    <Link href="/legal/cgv" className="font-medium text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </>
          )}
        </CenteredCard>
      </div>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run app/billing/__tests__/page.test.tsx`
Expected: PASS — 9 tests.

If `screen.getByText('1 / 2 échanges utilisé')` fails, print the received text and align the assertion with the existing `organizer.billing.usage` ICU string (`{used} / {cap} {cap, plural, …} {used, plural, …}`) rather than editing the message.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/billing/page.tsx app/billing/__tests__/page.test.tsx lib/billing/display.ts
git commit -m "feat(billing): cap-aware /billing with a self-service upgrade path"
```

---

## Task 8: Retire the duplicate copy source in `display.ts`

`lib/billing/display.ts` hardcodes French labels, prices, descriptions, audience lines and bullets that now all exist, translated, in `organizer.billing`. Nothing reads the copy any more — only the percentage math is still needed.

**Audit before deleting** (the cut is not mechanical — `getBillingOverview` reads from both sources):

- `PLAN_LABEL_FR` — was read by `app/billing/page.tsx` (Task 7 removed it) and `PlanSelector` (Task 5 removed it). `getBillingOverview` already reads `t('billing.plans.*.label')`.
- `PLAN_PRICE_FR`, `PLAN_DESC_FR`, `PLAN_AUDIENCE_FR`, `PLAN_FEATURE_BULLETS_FR`, `TRIAL_LABEL`, `TRIAL_PRICE`, `TRIAL_DESC`, `planCapLabel` — only `PlanSelector` and the display test read these; both are already migrated.
- `usageLine` — `getBillingOverview` uses only `usage.pct`; its `label` is dead there (replaced by `t('billing.usage')`).

**Files:**
- Modify: `lib/billing/display.ts` (full rewrite), `actions/settings.ts`, `lib/billing/__tests__/display.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `usagePct`, already added additively in Task 7.
- Produces: a `display.ts` whose **only** export is `usagePct`. `usageLine` and every `*_FR` / `TRIAL_*` / `planCapLabel` binding is deleted.

- [ ] **Step 1: Confirm nothing else still imports the retired names**

Run:
```bash
grep -rn "PLAN_LABEL_FR\|PLAN_PRICE_FR\|PLAN_DESC_FR\|PLAN_AUDIENCE_FR\|PLAN_FEATURE_BULLETS_FR\|TRIAL_LABEL\|TRIAL_PRICE\|TRIAL_DESC\|planCapLabel\|usageLine" \
  --include=*.ts --include=*.tsx . --exclude-dir=node_modules --exclude-dir=.claude
```
Expected: hits only in `lib/billing/display.ts`, `lib/billing/__tests__/display.test.ts` and `actions/settings.ts` (the `usageLine` import + its two uses). If any other file appears, migrate it to `planCopy` / the message catalog before continuing.

- [ ] **Step 2: Rewrite the display test**

Replace `lib/billing/__tests__/display.test.ts` entirely:

```ts
import { describe, it, expect } from 'vitest'
import { usagePct } from '@/lib/billing/display'

// Plan copy now lives in the `organizer.billing` message namespace — see
// lib/billing/__tests__/plan-copy.test.ts. Only the math is left here.
describe('usagePct', () => {
  it('is the rounded percentage of the cap', () => {
    expect(usagePct(1, 2)).toBe(50)
    expect(usagePct(2, 2)).toBe(100)
    expect(usagePct(0, 1)).toBe(0)
    expect(usagePct(2, 6)).toBe(33)
  })
  it('clamps above the cap', () => {
    expect(usagePct(3, 2)).toBe(100)
  })
  it('shows a token sliver for unlimited plans', () => {
    expect(usagePct(0, Infinity)).toBe(6)
    expect(usagePct(99, Infinity)).toBe(6)
  })
  it('is zero for a zero cap rather than NaN', () => {
    expect(usagePct(3, 0)).toBe(0)
  })
})

describe('the module surface', () => {
  // The retirement itself is the deliverable: nothing customer-facing may live
  // in this file any more, or /billing and Settings can drift back apart.
  it('exports only the math', async () => {
    const mod = await import('@/lib/billing/display')
    expect(Object.keys(mod).sort()).toEqual(['usagePct'])
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/billing/__tests__/display.test.ts`
Expected: FAIL on `exports only the math` — the received array still lists `PLAN_AUDIENCE_FR`, `PLAN_DESC_FR`, `PLAN_FEATURE_BULLETS_FR`, `PLAN_LABEL_FR`, `PLAN_PRICE_FR`, `TRIAL_DESC`, `TRIAL_LABEL`, `TRIAL_PRICE`, `planCapLabel`, `usageLine`, `usagePct`. The `usagePct` maths cases already pass (Task 7 added the function).

- [ ] **Step 4: Rewrite `lib/billing/display.ts`**

Replace the whole file:

```ts
// Non-copy billing math only. Every customer-facing plan string (labels, € prices,
// audience lines, feature bullets, cap wording) lives in the `organizer.billing`
// message namespace and is read through lib/billing/plan-copy.ts, so /billing and
// Settings cannot drift apart or fall back to untranslated French.

// Width of the usage bar. Unlimited plans get a token sliver rather than a
// meaningless 0% or 100%.
export function usagePct(used: number, cap: number): number {
  if (cap === Infinity) return 6
  return cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0
}
```

- [ ] **Step 5: Point `actions/settings.ts` at `usagePct`**

Three edits in `actions/settings.ts`:

1. Line 14 — change `import { usageLine } from '@/lib/billing/display'` to:
```ts
import { usagePct } from '@/lib/billing/display'
```

2. Delete the now-unused line `  const usage = usageLine(used, cap)` (currently line 135).

3. In the two returned objects, replace `usagePct: usage.pct` with:
```ts
usagePct: usagePct(used, cap),
```

- [ ] **Step 6: Run the affected suites**

Run: `npx vitest run lib/billing/__tests__/display.test.ts components/settings/__tests__/SettingsView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check and lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: no `tsc` output; lint reports no errors (an unused-import warning here means step 5.2 was missed).

- [ ] **Step 8: Commit**

```bash
git add lib/billing/display.ts lib/billing/__tests__/display.test.ts actions/settings.ts
git commit -m "refactor(billing): retire hardcoded French plan copy from display.ts"
```

---

## Task 9: Redirect call sites carry `?reason=limit`

**Files:**
- Modify: `components/shell/OrganizerShell.tsx:81`, `components/shell/NewExchangeModal.tsx:88`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx:97,110`, `components/shell/__tests__/NewExchangeModal.test.tsx:82`

**Interfaces:** none produced or consumed beyond the URL contract read by Task 7's page.

- [ ] **Step 1: Update the failing assertions first**

In `components/shell/__tests__/OrganizerShell.test.tsx`:
- line 97: `expect(push).toHaveBeenCalledWith('/billing')` → `expect(push).toHaveBeenCalledWith('/billing?reason=limit')`
- line 110: `expect(push).not.toHaveBeenCalledWith('/billing')` → `expect(push).not.toHaveBeenCalledWith('/billing?reason=limit')`

In `components/shell/__tests__/NewExchangeModal.test.tsx`:
- line 82: `await waitFor(() => expect(push).toHaveBeenCalledWith('/billing'))` → `await waitFor(() => expect(push).toHaveBeenCalledWith('/billing?reason=limit'))`

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/NewExchangeModal.test.tsx`
Expected: FAIL — two failures asserting `'/billing?reason=limit'` but receiving `'/billing'`. (The `not.toHaveBeenCalledWith` case still passes — it is tightened, not broken.)

- [ ] **Step 3: Update both call sites**

`components/shell/OrganizerShell.tsx` line 81, inside `handleNewExchange`:

```tsx
      router.push('/billing?reason=limit')
```

`components/shell/NewExchangeModal.tsx` line 88, inside the `result.error === 'limit'` branch:

```tsx
        router.push('/billing?reason=limit')
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/NewExchangeModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/NewExchangeModal.tsx components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/NewExchangeModal.test.tsx
git commit -m "feat(billing): tell /billing which action was blocked"
```

---

## Task 10: CLAUDE.md gotcha + full gate

The Stripe portal configuration step is a **hard prerequisite**: if plan switching is not enabled with all three prices listed under `features.subscription_update.products`, `billingPortal.sessions.create` returns a 400, the route degrades to `?error=unavailable`, and **the upgrade button is inert in production**. It is a dashboard step, not code — comparable to the Google OAuth provider setup — so it belongs in the billing gotcha next to the webhook event list.

**Files:**
- Modify: `CLAUDE.md` (the "Billing is a usage-based free trial" bullet under Gotchas & Conventions)

- [ ] **Step 1: Extend the billing gotcha**

In `CLAUDE.md`, in the bullet beginning `**Billing is a usage-based free trial, school-anchored.**`, replace the final sentence (`Register the prod webhook at /api/stripe/webhook for …`) with:

```markdown
Register the prod webhook at `/api/stripe/webhook` for `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
**Upgrades** (`app/billing/upgrade/route.ts`) swap the price on the existing subscription
through a Stripe-hosted `subscription_update_confirm` portal flow — never through
`/billing/checkout`, which would create a second parallel subscription and a second charge.
Two things make that work, and both are easy to break:
(1) **Dashboard prerequisite** — the customer portal configuration must have subscription
updates enabled with all three prices listed under `features.subscription_update.products`,
or `sessions.create` 400s and the upgrade button is silently inert (the route degrades to
`/billing?error=unavailable`). Manual step, like the Google OAuth provider config.
(2) **The webhook reads the plan from the price ID**, not from subscription metadata: a
portal price change does not rewrite metadata, so trusting `metadata.plan` would write the
*old* plan straight back and the organizer would pay for capacity they never receive
(`planForPriceId` in `lib/billing/plans.ts`; precedence price → metadata → unchanged).
```

- [ ] **Step 2: Run the full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: lint clean; every test file passes; build completes with no type errors. `pnpm test:rls` is deliberately **not** run — no migration, table, policy or bucket changed.

If `pnpm build` hangs on a phantom route, kill orphaned `next-server` workers and re-run.

- [ ] **Step 3: Final apostrophe guard**

Run: `grep -o "'" messages/fr.json | wc -l`
Expected: `15`.

- [ ] **Step 4: Review the staged diff for PII and stray files**

Run: `git status --short && git diff --stat HEAD~9..HEAD`
Expected: only the files named in Tasks 1–10. No `.env*`, no student data.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(billing): portal configuration prerequisite and price-ID plan resolution"
```

---

## Manual gate before merge

Both are **hard gates** — the feature is inert in production without step 1, and step 2 is the only end-to-end proof that the webhook fix holds.

- [ ] **1. Stripe dashboard (test mode, then live).** Billing → Customer portal → enable *Customers can switch plans*, and list all three products/prices under the allowed products. Without this, `sessions.create` returns 400.

- [ ] **2. Test-mode end-to-end.** Subscribe to Essentiel → create 2 exchanges → click « + Nouvel échange » → land on `/billing?reason=limit` showing « Votre offre Essentiel est complète » and two upgrade cards → click « Passer à Association » → complete the Stripe confirmation → confirm `schools.plan` in Supabase has flipped to `growth` **and** a third exchange can then be created.

Watch the `customer.subscription.updated` event land 200 on the webhook endpoint; a 200 with `plan` still `starter` in the database means the price-ID resolution (Task 2) is not reading the right env values in that environment.

---

## Not covered here (spec §5)

Downgrades and cancellation (the generic portal keeps owning both), any change to `PLAN_EXCHANGE_CAP` or pricing, an annual/monthly toggle, and ROI or outcome-based framing on the cap-reached screen. The copy prices the upgrade in **exchanges** — the unit the cap is denominated in and the thing the organizer was just blocked from. Revisit as a copy-only follow-up if conversion is weak.
