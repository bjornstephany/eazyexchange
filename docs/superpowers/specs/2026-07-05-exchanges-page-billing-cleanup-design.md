# Exchanges page — remove inline pricing, silent upgrade redirect

**Date:** 2026-07-05
**Status:** Approved, ready for planning

## Problem

The organizer Exchanges page (`/exchanges`) renders a billing block above the
exchange list. For trial users this is a marketing panel: a star banner
("Essai gratuit — votre premier échange est offert") plus three pricing tiles
(Essentiel / Association / Réseau). It clutters what should be a simple
"here are your exchanges" view, and it duplicates the tier selection that
already lives at `/billing`.

## Goal

Make the Exchanges page purely operational: heading + exchange cards + a single
`+ Nouvel échange` button at the bottom. Move all subscription/tier selection to
the existing `/billing` page. A user who has hit their exchange cap (a trial user
with their 1 exchange, or any plan at its limit) is redirected to `/billing`
silently when they click the button.

## Non-goals

- No changes to billing logic, caps, Stripe, or `createExchange` enforcement.
- No schema/migration changes.
- No redesign of `/billing` beyond adding prices to its tier selector.

## Design

### 1. Exchanges page (`components/exchanges/ExchangesView.tsx`)

Remove the entire billing block and its helpers:

- Delete `BillingSection`, `PlanTiles`, and the `BillingBlock` type/prop.
- Drop the now-unused imports (`PLAN_KEYS`, `PLAN_LABEL_FR`, `PLAN_PRICE_FR`,
  `planCapLabel`).

The page renders:

- Heading "Échanges" + subtitle (unchanged).
- "Vos échanges" section header (label only — no button in the header anymore).
- The exchange card list (unchanged), including the empty state
  ("Aucun échange pour l'instant — créez le premier.").
- A `+ Nouvel échange` button **below the list**.

The three billing states (trial banner + tiles, active-plan bar, grace warning)
are all removed. The grace/payment-failure warning is not lost: it already
renders globally at the top of every organizer page via `PaymentWarningBanner`
in `app/(organizer)/layout.tsx`. Plan management stays reachable via `/billing`
and Settings.

### 2. `+ Nouvel échange` button behavior

The server already computes `atCap`. The button keeps the same label and styling
in both states; only the click target differs:

- **Not at cap** → button opens the existing `NewExchangeModal`
  (via `openNewExchange` from `ShellUiContext`), as today.
- **At cap** → render the button as a `Link` to `/billing`. Clicking navigates
  straight to the subscription page — silent redirect, no hint text, no separate
  "Choisir un forfait" button.

`createExchange`'s server-side cap check is the real backstop and is untouched,
so a stale `atCap` cannot let a create slip through.

### 3. `/billing` subscription page — add prices

`components/billing/PlanSelector.tsx` currently shows each tier's name + cap
("2 échanges") but no price. Add the price line under the tier name, reusing the
existing `PLAN_PRICE_FR` map from `lib/billing/display.ts`. Each tier reads:

```
Association
499 € / an
6 échanges
[ POPULAIRE ]
```

The "Continuer avec …" CTA, selection behavior, and page structure are unchanged.
No route changes — trial/at-cap users land here and see a complete
tiers-with-prices decision page.

## Files touched

- `components/exchanges/ExchangesView.tsx` — strip billing block, move button to
  bottom, rewire at-cap → `/billing` link.
- `app/(organizer)/exchanges/page.tsx` — stop computing/passing the `billing`
  block; keep passing `atCap` and `exchangesData`.
- `components/billing/PlanSelector.tsx` — add price display.
- `components/exchanges/__tests__/ExchangesView.test.tsx` — drop billing-block
  assertions; add: button opens modal when not at cap, button is a `/billing`
  link when at cap.
- `components/billing/__tests__/PlanSelector.test.tsx` — assert prices are shown.

## Verification

`pnpm lint`, `pnpm test`, `pnpm build` all green.
