# Stripe Billing with a Usage-Based Free Trial — Design

**Date:** 2026-07-01
**Status:** Approved design (revised), partially implemented

> **Revision note:** An earlier version of this spec used a card-upfront Stripe
> Checkout with a 14-day trial and a middleware dashboard lock. That model was
> replaced during implementation (after Task 1) with the usage-based free trial
> below: no card at signup, trial scoped to one exchange, and the only gate is
> exchange creation.

## Summary

Organizers sign up and use the app **free, with no card**, for **one exchange**.
Creating a **second** exchange requires subscribing to a paid plan via Stripe
Checkout. Plans raise the exchange cap. Billing state is **school-anchored** and
driven by Stripe webhooks.

There is **no time-based trial, no card at signup, and no dashboard lockout.** The
only enforcement point is the exchange-creation limit.

## Plans and exchange caps

| plan key  | Name    | Price     | Exchange cap |
|-----------|---------|-----------|--------------|
| *(none)*  | Trial   | free      | **1**        |
| `starter` | Starter | $299/year | **2**        |
| `growth`  | Growth  | $499/year | **6**        |
| `scale`   | Scale   | $599/year | **unlimited**|

- A school's cap is the cap of its **currently active** plan, or **1** (trial) if
  it has no active subscription.
- Enforcement counts a school's own exchanges: `exchanges where school_a_id =
  <school>` (an organizer is always `school_a`; `school_b` is a throwaway partner
  record with no organizer). Creating an exchange is allowed iff
  `currentCount < cap`.

## Why school-level billing

Every data row (`users`, `exchanges`, `form_templates`, students, submissions) is
scoped by `school_id`; the school is the tenant boundary all RLS policies key on.
Colleagues may share a `school_id`, so one subscription covers the whole
workspace. (There is no "join an existing school" flow yet — a separate, deferred
feature; school-anchored billing makes it slot in cleanly later.)

## End-to-end flow

### Signup (unchanged)

Email/password and Google signup are **unchanged**: the organizer is provisioned
and lands on `/dashboard`. The school has no subscription — it is in the trial
state (cap 1). No card, no redirect to checkout.

### Using the trial

The organizer creates and runs **one** exchange with full functionality. On the
dashboard, once they are at their cap, the "New exchange" affordance points at
`/billing` ("Subscribe to add more exchanges") instead of the create form.
`createExchange` also enforces the cap server-side (defense in depth).

### Subscribing

1. `/billing` shows the current plan/status and a **plan selector**
   (Starter / Growth / Scale). Pricing-page CTAs may pass `?plan=` to preselect.
2. Selecting a plan hits `GET /billing/checkout?plan=<plan>`, which creates a
   Stripe Checkout Session (`mode: subscription`, the plan's price, **no trial**,
   `client_reference_id = school_id`) and redirects to Stripe.
3. Card entered → Stripe creates an **active** subscription → returns to
   `/billing/return`, which re-checks status and forwards to `/dashboard`.
4. Card management / cancellation via Stripe's hosted **Customer Portal**
   (`GET /billing/portal`).

### Principle

Provisioning and the dashboard stay open; billing only raises the exchange cap.
The webhook — not the browser redirect — is the source of truth for status.

## Data model

Migration adds billing columns to `schools` (one subscription per school):

```sql
alter table schools add column stripe_customer_id     text unique;
alter table schools add column stripe_subscription_id text unique;
alter table schools add column subscription_status    text;      -- Stripe's status verbatim
alter table schools add column plan                   text;      -- 'starter' | 'growth' | 'scale'
alter table schools add column current_period_end     timestamptz;
alter table schools add column grace_until            timestamptz; -- set when a renewal payment first fails
```

- `subscription_status` stores Stripe's own status string verbatim (`active`,
  `past_due`, `unpaid`, `canceled`, `incomplete`). There is **no `trialing`** —
  the trial is the *absence* of an active subscription, tracked by exchange count.
- No `trial_ends_at`: the trial is usage-based, not time-based.
- `grace_until` is set to `now() + 7 days` the first time a renewal payment fails,
  and cleared when payment recovers.

### RLS / column privileges

RLS is row-level, not column-level: the existing "organizers update their school"
policy (`20260701000001`) would otherwise let an organizer set their own billing
columns from the browser (e.g. `plan='scale'`), granting themselves a higher cap.
The migration revokes broad `UPDATE` on `schools` from `authenticated` and
re-grants only `UPDATE (name)`. Billing columns are writable solely via the
service-role admin client (webhook), which bypasses RLS and column grants. The
existing `createExchange` name-update still works (touches only `name`).

## Plan caps & active-plan logic

`lib/billing/limits.ts`, pure functions used by `createExchange` and the UI:

- `PLAN_EXCHANGE_CAP: Record<PlanKey, number>` = `{ starter: 2, growth: 6, scale: Infinity }`.
- `TRIAL_EXCHANGE_CAP = 1`.
- `isInGrace(school, now)`: `status ∈ {past_due, unpaid}` AND `now < grace_until`.
- `hasActivePlan(school, now)`: `status === 'active'` OR `isInGrace(...)`.
- `exchangeCap(school, now)`: `hasActivePlan ? PLAN_EXCHANGE_CAP[plan] : TRIAL_EXCHANGE_CAP`.
- `canCreateExchange(school, currentCount, now)`: `currentCount < exchangeCap(...)`.

A lapsed subscription (canceled, or past grace) drops the cap back to 1. Existing
exchanges are **never deleted** — the school simply cannot create new ones beyond 1.

## Webhook (source of truth)

`POST /api/stripe/webhook` verifies the Stripe signature, then maps events to a
`schools` patch resolved by `stripe_customer_id` (persisted at Checkout-session
creation, so resolution works from the first event):

| Event | Effect on the school row |
|---|---|
| `checkout.session.completed`     | Store `stripe_subscription_id`, `plan`; set `subscription_status = 'active'` |
| `customer.subscription.updated`  | Sync `subscription_status`, `current_period_end`, `plan`; clear `grace_until` when `active` |
| `invoice.payment_failed`         | If `grace_until` is null, set it to `now() + 7 days` |
| `customer.subscription.deleted`  | `subscription_status = 'canceled'` |

All writes via the service-role admin client. Idempotent; tolerates out-of-order
delivery by trusting the payload's status. Signature failures → 400. Unknown
events → 200 + ignore.

## UI

- **Dashboard:** when `currentCount >= cap`, the "New exchange" button becomes a
  link to `/billing` labeled to invite subscribing; otherwise it opens the create
  form as today.
- **`/billing`:** status summary + plan selector (subscribe) or Customer Portal
  link (manage) depending on state.
- **Grace banner:** the organizer layout shows a warning banner while
  `isInGrace(school)` is true, linking to the Customer Portal.

## Error handling

- Checkout return page re-checks the school's status server-side (webhook may lag)
  and shows a brief "confirming…" state with a client poll if not yet active.
- `createExchange` throws a friendly upgrade-needed error when at cap.

## Testing

- **Unit:** `limits.ts` (caps, grace, active-plan, canCreateExchange) across states.
- **Unit:** webhook mapper for each event, including out-of-order/duplicate.
- **Unit:** `createExchange` cap enforcement (allowed under cap, blocked at cap).
- **Manual:** Stripe CLI `stripe listen` + a test subscription; verify subscribe →
  active → 2nd exchange allowed; cancel → cap reverts.

## Out of scope

- "Invite a colleague into my school" (join-existing-school) flow.
- Grace-period reminder emails (possible follow-on via the existing reminder cron).
- Proration / mid-cycle plan changes beyond what the Customer Portal provides.

## Environment variables

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=   # if any client-side Stripe.js is used
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_SCALE=
```
