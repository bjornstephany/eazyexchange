# Stripe Payment Processing During Organizer Signup — Design

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan

## Summary

Add Stripe subscription billing to the organizer signup funnel. Organizers pick
a plan, enter a card via Stripe Checkout on first entry, get a 14-day trial, and
are auto-charged when the trial ends. Access to the organizer dashboard is gated
on subscription status, with a 7-day grace period after a failed/ended payment
before the workspace locks.

Billing is **anchored on the school** (the tenant boundary), not the individual
organizer, so a shared workspace is covered by a single subscription.

## Billing model

- **Card upfront, trial then charge.** Stripe Checkout in `subscription` mode
  with `trial_period_days = 14`. The card is collected at signup; Stripe
  auto-charges when the trial ends.
- **Grace then lock.** When a payment fails or the trial ends unpaid, the
  organizer keeps access for a 7-day grace window (with warnings), then the
  workspace locks until payment is fixed.

## Plans

Three annual plans, matching the existing landing page tiers:

| plan key  | Name    | Price      |
|-----------|---------|------------|
| `starter` | Starter | $299/year  |
| `growth`  | Growth  | $499/year  |
| `scale`   | Scale   | $599/year  |

The tiers advertise exchange-count limits (1 / 2 / 3+ active exchanges).
Storing the selected `plan` is in scope; **enforcing exchange-count limits per
plan is out of scope** for this spec — it is a separate entitlement feature.

## Why school-level billing

Every data row in the schema (`users`, `exchanges`, `form_templates`, students,
submissions) is scoped by `school_id`; the school is the tenant boundary that all
RLS policies key on. The organizer may share the workspace with colleagues on the
same `school_id`, so one subscription must cover the whole workspace.

**Dependency / deferral:** today `provisionOrganizer` mints a *new* school on every
signup, so there is no "join an existing school" flow yet — two colleagues signing
up separately create two separate schools/subscriptions. The "invite a colleague
into my school" feature is separate work, out of scope here. School-anchored
billing means that feature slots in cleanly later (a joining organizer inherits
the school's active subscription).

## End-to-end flow

### Plan selection (both auth paths)

- Pricing CTAs become `/signup?plan=starter|growth|scale`. A generic
  "Get started" (not on the pricing page) links to `/signup` with no plan.
- The signup page gains a compact plan selector (three cards/radio),
  pre-selected from `?plan=`, defaulting to the "Most popular" tier (Growth)
  when absent. Users can always change the selection.
- Chosen `plan` is persisted:
  - **Email path:** in Supabase user metadata alongside `full_name` /
    `school_name`.
  - **Google path:** carried through OAuth state (default tier if none).

### Email/password path

1. Signup form (name, school, email, password, **plan**) → `signUp()` with
   `plan` in metadata → confirmation email.
2. User clicks link → `/auth/confirm?type=signup` → `provisionOrganizer()`
   creates school + profile (**unchanged**).
3. Because the new school has no subscription, confirm's redirect target becomes
   `/billing/checkout` instead of `/dashboard`.
4. `/billing/checkout` creates a Stripe Checkout Session (subscription mode,
   `trial_period_days = 14`, the metadata plan's price,
   `client_reference_id = school_id`) and redirects to Stripe.
5. Organizer enters card → Stripe creates a `trialing` subscription → returns to
   `/billing/return` → status confirmed → `/dashboard`.

### Google path

- `/auth/callback?intent=organizer_signup` provisions via
  `provisionOrganizerFromOAuth` (school name still deferred), then redirects to
  `/billing/checkout` instead of `/dashboard`. Plan comes from OAuth state
  (default tier if none). Checkout does not need the school name, so the
  deferred-school-name quirk is harmless.

### Principle

Provisioning stays exactly as-is; **billing is a gate layered after it, not woven
into account creation.** The webhook — not the browser redirect — is the source of
truth for subscription status.

## Data model

Migration adds billing columns to `schools` (single active subscription per
school — no separate `subscriptions` table yet):

```sql
alter table schools add column stripe_customer_id      text unique;
alter table schools add column stripe_subscription_id  text unique;
alter table schools add column subscription_status     text;      -- Stripe's status verbatim
alter table schools add column plan                    text;      -- 'starter' | 'growth' | 'scale'
alter table schools add column current_period_end      timestamptz;
alter table schools add column grace_until             timestamptz; -- set when payment first fails
```

- `subscription_status` stores Stripe's own status string verbatim (`trialing`,
  `active`, `past_due`, `canceled`, `unpaid`, `incomplete`) — no parallel
  vocabulary.
- **Entitlement is derived, not stored** (see `isEntitled` below).
- `grace_until` is set to `now() + 7 days` the first time a payment failure
  arrives, and cleared when payment recovers.

### RLS

- These columns live on the existing `schools` row, which organizers can already
  read. They must **not** be writable from the client — only the webhook
  (service-role admin client) writes billing columns.
- Verify the existing `schools` UPDATE policy
  (`20260701000001_schools_update_own_name.sql`) cannot be abused to set billing
  columns; if needed, restrict that policy's column scope. All billing writes go
  through the service-role admin client in the webhook, never the browser.

## Webhook, state machine & gating

### Webhook (`/api/stripe/webhook`) — source of truth

Verifies Stripe's signature, then handles a small event set. Each event resolves
`customer` → `schools` row via `stripe_customer_id` (seeded at Checkout with
`client_reference_id = school_id`):

| Event | Effect on the school row |
|---|---|
| `checkout.session.completed`     | Store `stripe_customer_id`, `stripe_subscription_id`, `plan`; set `subscription_status = trialing` |
| `customer.subscription.updated`  | Sync `subscription_status`, `current_period_end`, `plan`; on recovery to `active`, clear `grace_until` |
| `invoice.payment_failed`         | If `grace_until` is null, set it to `now() + 7 days` |
| `customer.subscription.deleted`  | `subscription_status = canceled` |

- All writes use the service-role admin client.
- Idempotent (upsert-by-id); tolerates out-of-order delivery by trusting the
  payload's current status.
- Signature-failed webhooks return 400. Unknown events are acked with 200 and
  ignored.

### Entitlement — one pure function

`isEntitled(school)`:

- `status ∈ {trialing, active}` → entitled.
- `status ∈ {past_due, unpaid}` AND `now() < grace_until` → entitled (grace).
- Otherwise → locked.

Used by both middleware and UI banners.

### Gating (middleware)

For organizer routes only, look up the school and apply `isEntitled`:

- Entitled → through.
- In grace → through, but a `<PaymentWarningBanner>` shows
  "Payment failed — access ends {grace_until}."
- Locked / no subscription → redirect to `/billing`.
- `/billing/*` is always exempt so a locked organizer can recover.
- Student routes are never gated.

### Card management

Card updates / cancellation are handled by Stripe's hosted **Customer Portal**
(near-zero code), linked from `/billing`.

### Grace-period reminders (follow-on, not MVP)

The existing daily `send-reminders` edge function can also nudge schools whose
`grace_until` is approaching, reusing the current pacing philosophy. Noted as a
follow-on, not required for MVP.

## Error handling

- **Checkout return page never trusts the redirect for state** — it re-checks the
  school's status (the webhook may lag a second), showing a brief "confirming your
  subscription…" state if still pending.
- Signature-failed webhooks → 400.
- Unknown webhook events → 200 + ignore.

## Testing

- **Unit:** `isEntitled` across every status/grace combination.
- **Unit:** webhook handler with sample Stripe payloads (mocked admin client) for
  each event, including out-of-order and duplicate delivery.
- **Unit/integration:** middleware gating for entitled / grace / locked / student.
- **Manual:** Stripe CLI `stripe listen` + test-clock to fast-forward a trial end.

## Out of scope

- Enforcing exchange-count limits per plan.
- "Invite a colleague into my school" (join-existing-school) flow.
- Grace-period reminder emails (follow-on).
- Proration / mid-cycle plan changes beyond what the Customer Portal provides.

## New environment variables

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=   # if any client-side Stripe.js is used
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_SCALE=
```
