# Onboarding flow for établissement capture — Design

**Date:** 2026-07-05
**Status:** Approved, ready for implementation plan

## Problem

The organizer sign-up page (`app/(auth)/signup/page.tsx`) asks for the school
name ("Établissement") up front. We want to remove that field from sign-up and
instead capture the établissement in a **dedicated onboarding page** shown after
first login.

Today the two sign-up paths are inconsistent:

- **Email/password** collects the school name at sign-up (via `signUp` metadata)
  and `provisionOrganizer` writes it to `schools.name`.
- **Google OAuth** already *defers* the school name: `provisionOrganizerFromOAuth`
  creates the school with an **empty name** (`''` sentinel), and the name is later
  captured inside the first **New Exchange** modal (`needsSchoolName` →
  `school_a_name` field, persisted in `createExchange`).

This design unifies both paths on a single, explicit onboarding step and retires
the exchange-modal capture entirely.

## Goals

- Remove the "Établissement" field from the sign-up page.
- Every new organizer (email/password **and** Google) starts with an empty school
  name and is sent through one dedicated onboarding page that collects it.
- Hard gate: no organizer page renders while the school name is empty.
- Retire the now-dead deferred-capture code in the New Exchange modal and
  `createExchange`.

## Non-goals

- No extra onboarding fields. Per the project's "minimal profile fields" rule, the
  onboarding page persists **only** the school name — nothing else consumes another
  field today.
- No multi-step wizard, no first-exchange prompt in the same flow.
- No change to student/parent flows.

## Design

### 1. Sign-up & provisioning

- **`app/(auth)/signup/page.tsx`**
  - Remove the "Établissement" `<Input>` and the `schoolName` state. The "Nom
    complet" field becomes full-width (the current two-column grid collapses).
  - Drop `school_name` from the `signUp` `options.data` metadata.
  - The client-side validation no longer requires a school (`if (!name)` only).
- **`lib/auth/provision.ts`**
  - `provisionOrganizer` (email/password) stops reading `school_name` and drops the
    `if (!schoolName) return { ok:false, reason:'missing_metadata' }` guard. It now
    calls `createOrganizerAccount(user, fullName, '')` — identical to
    `provisionOrganizerFromOAuth`.
  - Result: **every** new organizer starts with `schools.name === ''`.

### 2. The `/onboarding` page + hard gate

- **New route `app/onboarding/page.tsx`** — top-level, **outside** the
  `(organizer)` route group (so it inherits no shell and is not caught by the gate).
  - Server component:
    - `getAuthUser()` → `redirect('/login')` if unauthenticated.
    - `getProfile()` → students (`role !== 'organizer'`) redirect to `/my-forms`.
    - If the school name is already **non-empty**, `redirect('/dashboard')` (a
      completed organizer can't sit on onboarding).
  - Renders a small client form styled with the existing auth primitives
    (`AuthCard`, `Logo`): a light welcome heading + one "Votre établissement" field
    + submit. No other fields.
- **New server action `completeOnboarding(formData)`** (`actions/onboarding.ts`):
  - Auth + organizer check (mirrors `createExchange`'s guards).
  - Trim the submitted name; reject empty/whitespace with a user-facing error.
  - `update schools set name = <name> where id = profile.school_id`.
  - `revalidatePath('/dashboard')`, then `redirect('/dashboard')`.
- **Gate in `app/(organizer)/layout.tsx`**
  - After loading `school`: `if (school && school.name === '') redirect('/onboarding')`.
  - This replaces the `needsSchoolName` prop. Keep existing null-safety
    (`school?.name ?? ''`); only redirect when the row exists with an empty name.
  - Post-confirm/post-callback redirects to `/dashboard` naturally bounce here.

### 3. Retire the deferred-capture path

Because the gate guarantees a non-empty school name before any `(organizer)` page
renders, the Google-era capture code is dead:

- **`components/shell/NewExchangeModal.tsx`** — remove the `needsSchoolName` prop and
  the conditional `school_a_name` ("Votre établissement") field block.
- **`components/shell/OrganizerShell.tsx`** — remove `needsSchoolName` from the props
  interface and stop threading it to the modal.
- **`app/(organizer)/layout.tsx`** — remove the `needsSchoolName={…}` prop from
  `<OrganizerShell>`.
- **`actions/exchanges.ts` → `createExchange`** — remove the
  `if (ownSchool.name === '') { … school_a_name … }` block. **Keep** the `ownSchool`
  fetch; it is still needed for the billing/plan cap check.

## Rejected alternatives

- **Gate in middleware** — would require a DB query (or a new JWT/cookie claim) per
  request to know the school name, adding round-trips to every request. Rejected on
  performance grounds; the organizer layout already fetches this data.
- **Gate only on `/dashboard`** — leaky: bookmarked `/settings` or exchange
  deep-links would render with an empty school name, defeating the hard gate.
- **Reuse the exchange-modal capture** for email/password too — minimal, but not a
  real onboarding flow and keeps two divergent mechanisms.

## Testing strategy

- **Unit — `completeOnboarding`**: rejects empty/whitespace; persists trimmed name;
  blocks unauthenticated and non-organizer callers.
- **Unit — onboarding page**: redirects to `/dashboard` when the name is already
  set; redirects unauthenticated to `/login`.
- **Unit — sign-up / provision**: sign-up no longer renders the Établissement field
  or sends `school_name`; `provisionOrganizer` creates the school with `''`.
- **Component — `NewExchangeModal`**: no longer renders the school-name field
  (update existing `NewExchangeModal.test.tsx`, drop `needsSchoolName` cases).
- **Update** `signup.test.tsx` accordingly.
- **Gate**: full `pnpm lint && pnpm test && pnpm build` before commit.

## Files touched

| File | Change |
| --- | --- |
| `app/(auth)/signup/page.tsx` | Remove Établissement field + metadata |
| `lib/auth/provision.ts` | Email/password path defers school name (`''`) |
| `app/onboarding/page.tsx` | **New** — dedicated onboarding page |
| `actions/onboarding.ts` | **New** — `completeOnboarding` action |
| `app/(organizer)/layout.tsx` | Add redirect gate; drop `needsSchoolName` prop |
| `components/shell/NewExchangeModal.tsx` | Remove `needsSchoolName` + school field |
| `components/shell/OrganizerShell.tsx` | Remove `needsSchoolName` prop |
| `actions/exchanges.ts` | Remove deferred school-name block in `createExchange` |
| `app/(auth)/__tests__/signup.test.tsx` | Update |
| `components/shell/__tests__/NewExchangeModal.test.tsx` | Update |
| onboarding tests | **New** |
