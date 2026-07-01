# Stripe Billing — Go-Live Setup

The Stripe billing code is deployed to production but **inert** until the steps
below are done. Model: usage-based free trial (1 free exchange), paid plans raise
the exchange cap (Starter 2 / Growth 6 / Scale unlimited). No card at signup;
organizers subscribe at `/billing`.

Do all of this in Stripe **Live mode** (top-right toggle) once your business is
verified. For local development, repeat in **Test mode** with test keys/prices —
Prices and webhooks are per-mode and never shared.

## What the code expects

The app reads exactly these env vars (verified against the source):

| Env var | Used by | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `lib/billing/stripe.ts` | `sk_live_…` (or `sk_test_…` locally) |
| `STRIPE_WEBHOOK_SECRET` | `app/api/stripe/webhook/route.ts` | `whsec_…` from the webhook endpoint |
| `STRIPE_PRICE_STARTER` | `lib/billing/plans.ts` | `price_…` for the Starter yearly price |
| `STRIPE_PRICE_GROWTH` | `lib/billing/plans.ts` | `price_…` for the Growth yearly price |
| `STRIPE_PRICE_SCALE` | `lib/billing/plans.ts` | `price_…` for the Scale yearly price |

**`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is NOT needed** — there is no client-side
Stripe.js; Checkout is a server-side redirect. Skip it.

## Step 1 — Create the three products & prices

Each plan needs one **recurring, yearly** Price. Amounts match the landing page.

### Option A — Stripe Dashboard
For each of Starter / Growth / Scale:
1. **Products → Add product.** Name it `Starter` (then `Growth`, `Scale`).
2. Pricing model: **Standard pricing**, **Recurring**, **Yearly**.
3. Amount: **$299** (Starter), **$499** (Growth), **$599** (Scale). Currency USD.
4. Save, then copy the **Price ID** (`price_…`) from the price row — that's what
   goes in the env var, *not* the product id (`prod_…`).

### Option B — Stripe CLI (faster, scriptable)
```bash
# Starter $299/yr
stripe products create --name "Starter"
stripe prices create --product <prod_id_from_above> \
  --unit-amount 29900 --currency usd -d "recurring[interval]=year"
# Repeat for Growth (49900) and Scale (59900)
```
Amounts are in **cents** (29900 = $299.00). Copy each returned `price_…`.

> The three price ids map to `STRIPE_PRICE_STARTER/GROWTH/SCALE`. If a plan's env
> var is missing at runtime, clicking that plan throws
> `Missing Stripe price env for plan: <plan>` (by design — fail loud, never bill
> the wrong plan).

## Step 2 — Get the secret key

Dashboard → **Developers → API keys** → copy the **Secret key** (`sk_live_…`).
This becomes `STRIPE_SECRET_KEY`.

## Step 3 — Create the webhook endpoint

Dashboard → **Developers → Webhooks → Add endpoint**.
- **Endpoint URL:** `https://eazyexchange.vercel.app/api/stripe/webhook`
  (use your production domain).
- **Events to send** — select exactly these four:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Add endpoint, then reveal the **Signing secret** (`whsec_…`). This becomes
  `STRIPE_WEBHOOK_SECRET`.

The route verifies this signature and returns **400** for anything unsigned
(already confirmed live), so the secret must match the endpoint exactly.

## Step 4 — Activate the Customer Portal

The "Manage billing" button (`/billing/portal`) calls
`stripe.billingPortal.sessions.create`, which errors until the portal is
configured. Dashboard → **Settings → Billing → Customer portal** → enable it and
**Save** (allow customers to update payment method and cancel subscriptions).

## Step 5 — Set the env vars in Vercel

Add the 5 vars in **both** the **Production** and **Preview** scopes
(Project → Settings → Environment Variables), then **redeploy** (env changes only
take effect on a new deployment):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_SCALE=price_...
```

Mark the secret key and webhook secret **Sensitive**. Redeploy: Deployments →
latest → **Redeploy**, or push any commit.

## Step 6 — End-to-end test on production

1. Sign up / sign in as an organizer → create **1** exchange (works on the free
   trial). The dashboard CTA now reads **"Subscribe to add more"**; a 2nd create
   is blocked.
2. Click a plan on `/billing` → Stripe Checkout → pay (use a real card in Live
   mode, or a test card `4242 4242 4242 4242` in Test mode) → land back on
   `/billing/return` → `/dashboard`.
3. Confirm in the DB: the school's `subscription_status` = `active`, `plan` set.
4. Create a 2nd exchange (allowed on Starter cap 2); a 3rd is blocked.
5. Cancel via **Manage billing** (Customer Portal) → the cap reverts to trial (1);
   existing exchanges remain accessible.
6. (Optional) Trigger `invoice.payment_failed` from the CLI (`stripe trigger
   invoice.payment_failed`) → confirm the grace banner appears and `grace_until`
   is set.

## Notes

- **Migration is already applied** to prod (`20260701000002` — billing columns +
  the `UPDATE(name)`-only client grant). No `db push` needed for this feature.
- **Trial has no time limit** — it is scoped to one exchange, not a countdown.
- Billing state on `schools` is written **only** by the webhook (service-role);
  the browser cannot set `plan`/`subscription_status` (RLS column grant blocks it).
- For **local dev**, put `sk_test_…`, test price ids, and a test `whsec_…` (from
  `stripe listen --forward-to localhost:3000/api/stripe/webhook`) in `.env.local`.
