# Exchange-creation billing notice — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation plan

## Problem

When an organizer opens the "Nouvel échange" modal, nothing tells them where they
stand against their plan's exchange cap. Trial users don't know the trial only
allows one exchange; paid users don't know how many exchanges they have left or
that creating one consumes an allowance. We want a non-blocking heads-up inside
the modal.

## Scope

- Add an informational banner at the **top of `NewExchangeModal`** (above the
  form), shown only for the relevant billing states.
- No change to `createExchange`, the cap logic, or the at-cap `/billing`
  redirect.

## Behavior — the notice matrix

The banner is informational and non-blocking; the form behaves exactly as today.

At-cap users never reach the modal (the "+ Nouvel échange" affordance redirects
them to `/billing` — see `OrganizerShell.handleNewExchange`), so `remaining` is
always ≥ 1 by the time the modal renders.

| User state | Cap | Banner? | Tone | Copy |
|---|---|---|---|---|
| Trial (no active plan) | 1 | Yes | amber / "attention" | Vous êtes en période d'essai : vous ne pouvez créer qu'un seul échange. Abonnez-vous pour en créer davantage. |
| Paid, finite (Starter=2 / Growth=6) | 2 / 6 | Yes | neutral info | Il vous reste **N** échange(s) à créer sur votre offre. En créer un maintenant en consommera un. |
| Paid, Scale | ∞ | No | — | — |

Pluralization for the paid case:
- **N = 1:** "Il vous reste 1 échange à créer sur votre offre. En créer un maintenant l'utilisera."
- **N ≥ 2:** "Il vous reste N échanges à créer sur votre offre. En créer un maintenant en consommera un."

## Data flow

`app/(organizer)/layout.tsx` already computes billing state server-side (`school`,
`ownedCount`, `exchangeCap`, `atCap`). It gains two derived values:

- `isTrial = !hasActivePlan(school)` — reuse `hasActivePlan` from `lib/billing/limits.ts`.
- `remaining = exchangeCap(school) - ownedCount` — a finite number for
  Trial/Starter/Growth, `Infinity` for Scale.

Both flow down: `layout.tsx` → `OrganizerShell` (new props) → `NewExchangeModal`
(new props). `remaining === Infinity` is the signal to render nothing (Scale).

## Components

1. **`lib/billing/exchange-notice.ts`** — a pure helper:
   ```ts
   export function exchangeNoticeMessage(
     input: { isTrial: boolean; remaining: number },
   ): { tone: 'warning' | 'info'; message: string } | null
   ```
   - `isTrial` → `{ tone: 'warning', message: <trial copy> }`
   - `!isTrial && Number.isFinite(remaining)` → `{ tone: 'info', message: <paid copy, pluralized on remaining> }`
   - `!isTrial && !Number.isFinite(remaining)` (Scale) → `null`

   Kept out of the `'use server'` action file and out of the component so the
   branching + pluralization is unit-testable in isolation and the modal stays
   presentational. Copy strings live here (consistent with the existing
   `lib/billing/exchange-limit.ts` message constants).

2. **`app/(organizer)/layout.tsx`** — derive `isTrial` and `remaining`; pass to
   `OrganizerShell`.

3. **`components/shell/OrganizerShell.tsx`** — accept `isTrial` + `remaining`
   props, forward them to `<NewExchangeModal>`. (These are separate from the
   existing `atCap` boolean, which stays.)

4. **`components/shell/NewExchangeModal.tsx`** — accept `isTrial` + `remaining`
   props, call `exchangeNoticeMessage(...)`, and when non-null render a banner
   between `DialogDescription` and the `<form>`. `tone: 'warning'` → amber
   styling; `tone: 'info'` → neutral/muted styling, matching existing modal
   design tokens.

## Testing

- **Unit** (`lib/billing/__tests__/exchange-notice.test.ts`):
  - trial → warning tone + trial copy
  - `{ isTrial: false, remaining: 2 }` → info tone + plural copy containing "2 échanges"
  - `{ isTrial: false, remaining: 1 }` → info tone + singular copy ("1 échange", "l'utilisera")
  - `{ isTrial: false, remaining: Infinity }` → `null`
- **Component** (`components/shell/__tests__/NewExchangeModal.test.tsx`):
  - trial props → trial banner visible
  - paid finite props → count banner visible
  - Scale props (`remaining: Infinity`) → no banner

## Out of scope

- Any change to caps, `createExchange`, or the at-cap redirect.
- Styling changes elsewhere in the modal.
- Localization beyond the existing French UI.
