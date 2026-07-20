# Force program details (first exchange) at onboarding

**Date:** 2026-07-20
**Status:** Approved — ready for implementation plan

## Goal

Every organizer reaches the dashboard only *after* creating a real program:
a named exchange with at least one filled-in Info card. New signups and
existing accounts that own no exchange are both routed through this. Students
then land on an `/infos` page that isn't blank from day one.

**No schema change** — reuses the existing `exchanges` and
`exchange_info_cards` tables and the existing info-card validation.

## Background (current state)

- Onboarding (`app/onboarding/OnboardingForm.tsx`) is a 2-step client wizard:
  step 1 sets the school name (`completeOnboarding` in `actions/onboarding.ts`),
  step 2 optionally invites colleagues, then `router.push('/dashboard')`.
- The organizer layout (`app/(organizer)/layout.tsx:25`) hard-gates on
  `school.name === ''` → `redirect('/onboarding')`. It already fetches the
  school's exchanges and computes `ownedCount` (exchanges where
  `school_a_id === school_id`, archived included).
- Exchanges are otherwise created via the "Nouvel échange" modal
  (`components/shell/NewExchangeModal.tsx` → `createExchange` in
  `actions/exchanges.ts`), which takes only a `name` (year auto,
  `school_b_id` null) and sets `ACTIVE_EXCHANGE_COOKIE`.
- Info cards are free-form `{ title, body, position }` rows
  (`exchange_info_cards`), authored in the Communication → Infos tab
  (`addInfoCard` in `actions/exchanges.ts`, validated by
  `lib/exchange/info-card.ts`: `validateInfoCard`, `INFO_TITLE_MAX = 120`,
  `INFO_BODY_MAX = 2000`; title required, body may be empty). Students read
  them at `/infos`.

## Design

### 1. Onboarding flow (step-aware)

`OnboardingForm` becomes a 3-step client wizard. The **starting step** is
decided server-side from profile state so both entry paths work:

1. **School name** — existing step. Rendered only when `school.name === ''`
   (fresh signup). An existing organizer who already named their school but
   owns no exchange starts at step 2.
2. **First exchange (NEW, required)** — name the program + guided Info cards.
   Cannot be skipped.
3. **Invite colleagues** — existing step, stays optional → `/dashboard`.

The `/onboarding` page (`app/onboarding/page.tsx`) reads the profile + whether
the school owns any exchange and passes an `initialStep` (1 or 2) to
`OnboardingForm`.

### 2. The forced exchange step (guided prompts)

- One required text input: **exchange name** (same placeholder/style as the
  modal).
- Below it, **5 pre-titled Info cards** rendered as editable rows, using the
  suggested prompts as titles (FR primary):
  1. **Dates clés**
  2. **Destination**
  3. **Hébergement**
  4. **Contact organisateur**
  5. **À prévoir**

  Each row has an editable title (pre-filled, changeable) + a body textarea.
  The organizer fills the bodies they care about.
- **Requirement: at least one card with a non-empty body.** Cards left with an
  empty body are not created. Enforced **server-side** (client-only is
  bypassable, and this is the point of the feature).
- Reuses `INFO_TITLE_MAX` / `INFO_BODY_MAX` and `validateInfoCard`.

### 3. Server action — `completeFirstExchange(name, cards[])`

New action in `actions/onboarding.ts` (co-located with `completeOnboarding`),
rather than overloading the modal's `createExchange`. Structured returns for
expected outcomes (thrown messages are redacted in prod).

Steps:
1. `requireOrganizer()`; trim `name`, reject empty as a structured error
   (matches `createExchange`'s `'invalid'` shape).
2. Enforce the plan cap via the existing `canCreateExchange(...)` check. At 0
   exchanges it always passes, but keeps the cap rule in one shape (return the
   existing `'limit'` outcome if somehow at cap).
3. Reject if **zero** cards have a non-empty (trimmed) body — structured error
   with an i18n code.
4. Insert the exchange (`name`, auto `year`, `school_a_id = school`,
   `school_b_id = null`, `apply_slug`) and set `ACTIVE_EXCHANGE_COOKIE` — same
   as `createExchange`.
5. Insert each **filled** card (title + trimmed body, sequential `position`
   starting at 0), reusing `validateInfoCard`. Empty-body cards dropped.
6. Return `{ ok: true }` or a structured error. The client advances to the
   invite step on success.

The existing `createExchange` modal path (2nd+ exchanges) is **unchanged** — the
card requirement is an onboarding/first-setup rule, not a per-exchange one.

### 4. Hard gate (`app/(organizer)/layout.tsx`)

Extend the existing `school.name === ''` redirect: also
`redirect('/onboarding')` when the school owns **zero** exchanges
(`ownedCount === 0`, already computed). Because `ownedCount` counts archived
exchanges too, archiving your only exchange does not re-trap you. This enforces
the rule for existing empty accounts, not just fresh signups.

Order of checks: keep the `name === ''` redirect first (so a truly fresh
account starts at step 1), then the `ownedCount === 0` redirect.

### 5. i18n

New strings in all 5 locales (`en`/`fr`/`es`/`it`/`de`):
- Step 2 heading/subtext, exchange-name label/placeholder, submit/continue.
- The 5 card-prompt titles.
- Validation error(s): empty name, "add at least one card".

Apply careful FR transcription (known accent/apostrophe pitfalls; run the
apostrophe guard after any FR subagent work).

## Testing

- **`completeFirstExchange`** (`actions/__tests__/`): creates exchange + filled
  cards; drops empty-body cards; **rejects when zero filled cards**; rejects
  empty name; respects the plan cap; sets `ACTIVE_EXCHANGE_COOKIE`.
- **Layout gate** (`app/__tests__/`): redirects to `/onboarding` when
  `ownedCount === 0`; does not when ≥1 (including archived-only).
- **`OnboardingForm`**: step-aware start (`initialStep`); cannot advance past
  step 2 without a filled card; invite step stays optional.
- **i18n**: key-presence check across the 5 locales.
- `pnpm lint`, `pnpm test`, `pnpm build`. No migration → `test:rls` not required.

## Non-goals

- No new `exchanges` columns / structured date fields.
- No change to the "Nouvel échange" modal or `createExchange`.
- No retroactive card requirement on existing exchanges.
- No change to how students render `/infos`.
