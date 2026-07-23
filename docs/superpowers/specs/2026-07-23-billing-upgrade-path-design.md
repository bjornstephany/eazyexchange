# Billing upgrade path — design

**Date:** 2026-07-23
**Status:** approved, ready for planning
**Branch:** `feature/billing-upgrade-path`

## Problem

An organizer on a paid plan who hits their exchange cap is redirected to `/billing`
and shown a dead end: the heading, the sentence « Vous êtes sur l’offre Essentiel
(2 échanges) », and a primary button labelled « Gérer la facturation » that opens the
generic Stripe customer portal.

Three things are wrong with that moment.

1. **There is no upgrade path in the product at all.** `app/billing/page.tsx` gates
   `<PlanSelector />` behind `active === false`. A subscriber never sees a price, a
   plan name, or a purchase CTA. The only way to buy more capacity today is to find
   the plan-switching screen inside the Stripe portal unaided.
2. **The page does not know why the organizer arrived.** `OrganizerShell.tsx:81` and
   `NewExchangeModal.tsx:87` both `router.push('/billing')` with no context, so the
   page cannot acknowledge the action that was just blocked. It reads as a passive
   settings screen at the exact moment the organizer wanted to do something.
3. **« Gérer la facturation » is the wrong verb.** It describes administration, not
   the outcome the organizer wants (« I want a third exchange »).

## Goal

Turn the at-cap moment into a working, self-service upgrade: name the blocked action,
show only the tiers that unlock it, price each one by the **capacity it adds**, and
send the organizer to a Stripe-hosted confirmation that actually changes their plan.

Non-goals: no pricing changes, no new tiers, no downgrade/cancel UI (the portal keeps
owning those), no change to the trial → first-purchase flow beyond copy and i18n.

---

## 1. Upgrade mechanism

### 1.1 Why not the existing checkout route

`/billing/checkout` creates a Checkout Session with `mode: 'subscription'` against the
school's existing `stripe_customer_id`. Pointing a current subscriber at it produces a
**second, parallel subscription** and a second charge — not an upgrade. Upgrades need
their own route.

### 1.2 `app/billing/upgrade/route.ts` (new)

`GET /billing/upgrade?plan=<growth|scale>`. Structurally a sibling of the existing
`app/billing/portal/route.ts`: `runtime = 'nodejs'`, auth via `createClient()`, school
lookup via `createAdminClient()`, `isStripeConfigured()` guard, `try/catch` that logs
the Stripe message (no PII) and falls back to `/billing?error=unavailable`.

Guards, evaluated before any Stripe call:

| Condition | Action |
|---|---|
| Not authenticated / no profile / no school | `redirect('/login')` |
| `plan` query is not a valid plan key | `redirect('/billing')` |
| No `stripe_subscription_id`, or `!hasActivePlan(school)` | `redirect('/billing/checkout?plan=X')` — a trial user; checkout is the correct route for them |
| `PLAN_RANK[target] <= PLAN_RANK[current]` | `redirect('/billing')` — makes the route upgrade-only |
| `!isStripeConfigured() \|\| !hasPriceForPlan(plan)` | `redirect('/billing?error=unavailable')` |

The rank guard is what stops a hand-edited URL from triggering a surprise downgrade or
a same-plan re-confirmation.

On success, retrieve the subscription to get the item being replaced, then open a
deep-linked portal session. Shape verified against the installed `stripe@22.3.0`
types (`cjs/resources/BillingPortal/Sessions.d.ts`):

```ts
const sub = await stripe.subscriptions.retrieve(school.stripe_subscription_id)
const itemId = sub.items.data[0].id

const session = await stripe.billingPortal.sessions.create({
  customer: school.stripe_customer_id,
  return_url: `${appUrl}/billing`,
  flow_data: {
    type: 'subscription_update_confirm',
    subscription_update_confirm: {
      subscription: school.stripe_subscription_id,
      items: [{ id: itemId, price: priceIdForPlan(plan), quantity: 1 }],
    },
    after_completion: { type: 'redirect', redirect: { return_url: `${appUrl}/billing` } },
  },
})
return NextResponse.redirect(session.url, { status: 303 })
```

Stripe then owns the proration arithmetic, the card re-authentication, the
confirmation screen and the receipt. We own none of it.

### 1.3 Landmine: the webhook would silently revert the upgrade

`lib/billing/webhook.ts` sets the plan on `customer.subscription.updated` from
subscription metadata only:

```ts
if (isPlanKey(sub.metadata?.plan)) patch.plan = sub.metadata.plan
```

A portal-driven price change **does not rewrite subscription metadata**. It stays
`plan: 'starter'` from the original checkout. Without a fix, the organizer pays the
proration, Stripe fires the event, and we write `plan: 'starter'` straight back —
their cap never moves and they have paid for nothing.

Fix: derive the plan from the price actually on the subscription, which is present in
the event payload at `sub.items.data[0].price.id`.

- Add `planForPriceId(id: string): PlanKey | null` to `lib/billing/plans.ts`, the
  inverse of the existing `priceIdForPlan`, reading the same `PRICE_ENV` map.
- In the `customer.subscription.updated` branch, resolve the plan with precedence
  **price ID → `metadata.plan` → leave unchanged**.

`resolveBillingUpdate` stays pure (no I/O; `process.env` reads already happen in
`plans.ts`), so the existing `webhook.test.ts` pattern covers the new cases directly.

The `checkout.session.completed` branch keeps using session metadata — it is correct
there, and the first-purchase path is unaffected.

### 1.4 Mandatory manual Stripe step

The SDK documents `flow_data.subscription_update_confirm.items[].price` as: *"The price
must also be included in the configuration's `features.subscription_update.products`."*

If plan switching is not enabled on the portal configuration with all three prices
listed, `sessions.create` returns a 400. Our `try/catch` degrades that to
`?error=unavailable` rather than a 500, but **the upgrade button would be inert in
production**.

This is a Stripe dashboard step, not code — comparable to the Google OAuth provider
setup. It must be done before this ships, and it belongs in the CLAUDE.md billing
gotcha alongside the webhook event list.

### 1.5 New pure module: `lib/billing/upgrade.ts`

```ts
PLAN_RANK: Record<PlanKey, number>   // starter 0 < growth 1 < scale 2
upgradeTargets(current: PlanKey): PlanKey[]      // 'starter' → ['growth','scale']; 'scale' → []
capDelta(current, target): { kind: 'more'; n: number } | { kind: 'unlimited' }
```

`capDelta` derives from `PLAN_EXCHANGE_CAP`, so it cannot drift from the caps the gate
actually enforces. It is what lets a card say **« +4 échanges »** rather than
« 6 échanges »: the delta is the pitch, the absolute number is not.

Both the route (rank guard) and the page (which cards to render) consume this module,
so the definition of "an upgrade" lives in exactly one place.

---

## 2. The page

### 2.1 Data

`app/billing/page.tsx` additionally counts the school's exchanges, using the same rule
as `getBillingOverview` (`actions/settings.ts:126-130`) so the two surfaces can never
disagree:

```ts
const { count } = await supabase
  .from('exchanges').select('id', { count: 'exact', head: true })
  .eq('school_a_id', profile.school_id)
```

Derived: `cap = exchangeCap(school)`, `used = count ?? 0`, `atCap = used >= cap`,
`blocked = searchParams.reason === 'limit'`.

### 2.2 State matrix

Evaluated in order; the first match wins.

| # | Condition | Renders |
|---|---|---|
| 1 | `isInGrace(school)` | Payment-failed banner, primary CTA « Mettre à jour ma carte » → `/billing/portal`. **Upgrade cards suppressed.** |
| 2 | `!hasActivePlan(school)` | Trial. Usage line + all three cards via `<PlanSelector />` → `/billing/checkout?plan=X` |
| 3 | `hasActivePlan(school)` | Usage bar + `<UpgradeOptions />` for `upgradeTargets(plan)` → `/billing/upgrade?plan=X` |

State 3 covers Réseau/`scale` without a special case: `upgradeTargets('scale')` is
empty, so the component renders the usage bar and the portal link and nothing else.

Grace takes precedence deliberately. `subscription_update_confirm` against a declining
card is a poor flow, and asking someone to spend *more* while their payment is failing
is the wrong ask. Fix the card first, upgrade after.

### 2.3 Urgency is driven by `atCap`, not by the query param

The heading and lead sentence flip on **`atCap`**, so an organizer sitting at 2/2 who
navigates from Settings sees the same honest framing as one who was just blocked.

`?reason=limit` adds exactly one extra lead-in sentence acknowledging the blocked
action. Both redirect call sites gain the param:

- `components/shell/OrganizerShell.tsx:81` → `router.push('/billing?reason=limit')`
- `components/shell/NewExchangeModal.tsx:87` → `router.push('/billing?reason=limit')`

This keeps the branching minimal and the page correct from every entry point,
including a bookmark or a direct URL.

### 2.4 Components

- **`components/billing/PlanCard.tsx`** (new, presentational). Owns the card visual —
  label, price, `/ an`, capacity line, audience line, feature bullets, optional badge
  slot, optional CTA slot. No billing logic.
- **`components/billing/PlanSelector.tsx`** (existing, kept). Trial path. Its
  radiogroup, arrow-key navigation and POPULAIRE badge already work and are
  accessible; it is refactored only to render `PlanCard` instead of inline markup.
- **`components/billing/UpgradeOptions.tsx`** (new). Paid path. Renders at most two
  `PlanCard`s, each with its **own** CTA (« Passer à Association ») linking to
  `/billing/upgrade?plan=X`, each showing its `capDelta`. No selection state — with
  two cards pointing at two different routes, a radiogroup buys nothing.

Extracting `PlanCard` is what keeps the two containers from duplicating the card
markup and drifting visually.

Secondary actions on every state: « Gérer ma facturation » (portal, demoted to a text
link) and « Retour au tableau de bord ».

---

## 3. Copy and i18n

New copy goes into the existing `organizer.billing` namespace in **all five** locale
files (`fr`, `en`, `es`, `de`, `it`):

- `capReached.heading` — « Votre offre {plan} est complète »
- `capReached.body` — « Vous utilisez vos {cap} échanges. Passez à l’offre supérieure pour en créer davantage. »
- `capReached.blockedLead` — the extra sentence shown only when `?reason=limit`
- `trialCapReached.heading` / `.body` — the trial equivalent (1/1)
- `upgradeCta` — « Passer à {plan} »
- `delta.more` — ICU plural: `+{n} {n, plural, one {échange} other {échanges}}`
- `delta.unlimited` — « Échanges illimités »
- `currentPlanBadge` — « Offre actuelle »
- `grace.heading` / `grace.body` / `grace.cta`

### 3.1 Retiring the duplicate source of truth

`lib/billing/display.ts` hardcodes French plan labels, prices, descriptions, audience
lines and feature bullets that **already exist, translated, in `organizer.billing.plans`**
(used by the Settings `BillingCard`). `/billing` is currently the last untranslated
organizer surface, and it reads the hardcoded copy.

This change points the page and `PlanSelector` at `t()` and reduces `display.ts` to
the non-copy math (`usageLine`'s percentage calculation). `PLAN_AUDIENCE_FR`,
`PLAN_FEATURE_BULLETS_FR` and `TRIAL_*` move into the namespace; `planCapLabel`
becomes a translated key since it returns user-facing French today.

**Every consumer is audited before anything is deleted** — `getBillingOverview`
currently reads from both `display.ts` and the message files, so the cut is not
mechanical.

### 3.2 Translation procedure

Per the standing rule: Sonnet-tier for the French strings (Haiku strips accents), then
the apostrophe guard over the touched message files. French copy uses typographic
apostrophes (`'`) to match the existing files.

---

## 4. Verification

New and updated tests:

- `lib/billing/__tests__/upgrade.test.ts` — `PLAN_RANK` ordering, `upgradeTargets` for
  each plan (including `scale` → `[]`), `capDelta` for every ordered pair.
- `lib/billing/__tests__/webhook.test.ts` — **the landmine case**: a
  `customer.subscription.updated` carrying the Association price with stale
  `metadata.plan: 'starter'` must resolve to `growth`. Plus: unknown price falls back
  to metadata; neither present leaves `plan` untouched; `checkout.session.completed`
  behaviour unchanged.
- `lib/billing/__tests__/plans.test.ts` — `planForPriceId` / `priceIdForPlan`
  round-trip, and `null` for an unknown id.
- Message parity test extended to the new keys across all five locales.

Gate: `pnpm lint && pnpm test && pnpm build`.

**`pnpm test:rls` is not triggered** — this change adds no migration, no table, no
policy and no bucket.

Manual, and a hard gate before merge:

1. Enable subscription updates on the Stripe portal configuration with all three
   prices listed (§1.4).
2. Test-mode end-to-end: subscribe to Essentiel, create 2 exchanges, click
   « + Nouvel échange », land on the cap-reached page, upgrade to Association,
   confirm `schools.plan` flips to `growth` **and** a third exchange can then be
   created.

## 5. Out of scope

- Downgrades and cancellation (the generic portal keeps owning both).
- Any change to `PLAN_EXCHANGE_CAP` values or pricing.
- Annual/monthly toggle.
- ROI or outcome-based framing on the cap-reached screen. The copy prices the upgrade
  in **exchanges**, the unit the cap is denominated in and the thing the organizer was
  just blocked from. Revisit as a copy-only follow-up if conversion is weak.
