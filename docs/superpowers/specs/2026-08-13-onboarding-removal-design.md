# Removing the forced onboarding flow

**Date:** 2026-08-13
**Status:** approved, not yet implemented

## Problem

`/onboarding` forces every new organizer through two steps before any organizer
page will render:

1. **Country + establishment.** A country `<select>` and, for France, a
   `school_registry` autocomplete. Writes `schools.name`, `schools.uai` and
   `schools.country` through the `claim_school()` RPC.
2. **First exchange.** Name, destination, and the two travel dates, which
   `completeFirstExchange` turns into an `exchanges` row, an
   `exchange_program_details` row and a set of generated `exchange_info_cards`.

Both are friction at the worst possible moment — the organizer's first minute in
the product, before they have any reason to trust it with their establishment's
identity. The first exchange in particular is a bespoke second implementation of
something the product already does well from the shell (`NewExchangeModal` →
`createExchange`), so a new organizer learns a screen they will never see again.

## Decision

Remove both steps. A confirmed organizer lands on `/dashboard` with nothing, and
creates their first exchange the same way they will create their fourth. The
establishment is no longer collected at all.

The onboarding code is **parked, not deleted** — the route is removed but every
module it used stays on disk, unreferenced, so the flow can be re-wired or
reshaped later without archaeology.

## Non-goals

- Replacing the establishment capture with a different prompt (settings field,
  signup field, new-exchange field). Deliberately dropped; see "Consequences".
- Changing `NewExchangeModal`, `createExchange`, or `EmptyDashboard`.
- Changing the onboarding tour.

## What changes

### Unwiring

`app/onboarding/page.tsx` is deleted, so the route 404s. Three call sites lose
their target:

| Site | Change |
| --- | --- |
| `app/(organizer)/layout.tsx:73` | Drop the `mustOnboard` redirect and its import. This is the gate itself. |
| `app/(auth)/signup/actions.ts:82` | `emailRedirectTo` → `/dashboard` |
| `app/(auth)/signup/page.tsx:198` | `GoogleButton next` → `/dashboard` |

`app/robots.ts` loses its now-dead `/onboarding` disallow entry.

### Parked, kept on disk, unreferenced

- `app/onboarding/OnboardingForm.tsx`
- `app/onboarding/SchoolCombobox.tsx`
- `actions/onboarding.ts` — all three actions (`searchSchools`,
  `completeOnboarding`, `completeFirstExchange`)
- `lib/onboarding/gate.ts`, `lib/onboarding/draft.ts`,
  `lib/onboarding/first-exchange.ts`

Their unit tests all exercise modules rather than the route, so they keep
passing untouched and remain the proof that the parked code still works. That
includes `actions/__tests__/onboarding-first-exchange.test.ts`, which now covers
unreachable code — keeping it is the point of parking.

### Tests that must change

- `app/__tests__/onboarding-page.test.ts` — **deleted.** It imports the deleted
  page and asserts only redirect behavior that no longer exists.
- `tests/smoke/signup.spec.ts:75` — the post-confirmation assertion flips from
  `/\/onboarding$/` to `/\/dashboard$/`. The comment on line 74 ("the account
  goes straight to onboarding") updates with it.
- `app/onboarding/__tests__/OnboardingForm.test.tsx` — unchanged; it renders the
  component directly.

## The new first-run flow

```
signup → confirm link → app/auth/confirm/route.ts
       → provisionOrganizer  (blank school, 0 exchanges)
       → /dashboard
       → resolveActiveExchange → null → <EmptyDashboard />
       → « Nouvel échange » → NewExchangeModal → createExchange
       → router.push('/dashboard') → <OverviewView />
```

`createExchange` already runs every guard `completeFirstExchange` mirrored —
name required, plan cap via `canCreateExchange`, `applySlug`,
`ACTIVE_EXCHANGE_COOKIE`, `revalidatePath('/', 'layout')`. Nothing is lost in
the swap.

The tour is unchanged. It auto-starts over the empty dashboard, which is new
(the gate previously guaranteed a populated shell), but its anchors are the nav
tabs and those render unconditionally, so `visibleStepIndices` is unaffected.

### Why no page hardening is needed

The hard gate guaranteed every organizer page had at least one exchange.
Removing it means each must survive `active === null`. Every one already does:

| Page | Behavior with no exchange |
| --- | --- |
| `dashboard`, `forms`, `students`, `applications`, `applications/questionnaire` | `return <EmptyDashboard />` |
| `communication` | `redirect('/dashboard')` |
| `settings` | `program` and `programDetails` stay `null`; guarded reads |
| `exchanges/[id]/*` | id-parameterized, unreachable with zero exchanges |

This was verified by reading each `page.tsx`, not assumed.

## Consequences

### The establishment is never captured

`claim_school()` remains as an RPC with no caller. It stays the only writer of
`schools.name` / `uai` / `country`, so those stay blank for every new school,
permanently, with no UI anywhere to set them. This is accepted, not overlooked.

Downstream:

- **`sending_school_name` and `sending_city`** on `exchange_program_details`
  stay null, so the engagement, absence and décharge fillable forms render them
  as blanks the organizer fills. `lib/forms/fillable/render.ts:61` already
  handles the null case.
- **Colleague invite emails** already fall back to « son établissement »
  (`lib/email.ts:298`). No change.
- **Feedback notification emails** put the school name in the subject
  (`lib/email.ts:327`); it will be empty. Internal-only, accepted.
- **The shell header on `/settings`** (`OrganizerShell.tsx:200`) renders
  `schoolName` — falls back to `organizerName`, already a prop. No new copy.
- **`ProfileCard`'s locked school-name row** is skipped entirely when the value
  is empty, rather than rendering a labelled blank. No new copy.

### The first exchange is born bare

`completeFirstExchange` created an `exchange_program_details` row and generated
info cards from destination + travel dates. `createExchange` does neither, so
the first exchange starts with no program details and no info cards — exactly
like every later exchange. Those are picked up from the add-a-form prompt and
the Communication → Infos editor.

This is a genuine reduction in what a new organizer has after five minutes, and
it is the intended trade: one uniform way to create an exchange beats a richer
first one.

### Existing accounts

Prod accounts currently trapped behind the gate (blank school name and/or zero
exchanges) simply enter the shell on their next request. No migration, no data
change, nothing to backfill.

## Verification

- `pnpm lint`, `pnpm test`, `pnpm build`.
- No migration and no RLS change, so `pnpm test:rls` is not required.
- Browser pass on a fresh signup: confirm link → lands on `/dashboard` with
  `EmptyDashboard` → « Nouvel échange » → exchange created → `OverviewView`.
- Browser pass on `/settings` with a blank school name: header shows the
  organizer's name, no empty school-name row.
- `/onboarding` returns 404.
