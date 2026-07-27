# Signup slimming — design

**Date:** 2026-07-27
**Status:** approved, ready for planning
**Branch:** `feature/signup-slimming`

## Problem

`/signup` asks a self-registering organizer for six things: full name, establishment
(registry combobox), role, « Comment nous avez-vous connus ? », email, password. Three
of those are not needed to create an account:

- **The establishment is asked twice.** `/onboarding` step 1 already captures it —
  country selector, registry combobox for France, free-text plus manual review for the
  other four countries — through `claim_school()`. Email/password signups currently skip
  that step because `provisionOrganizer` has already named the school from signup
  metadata; only Google signups see it.
- **Role and how-found-us are intake trivia.** They exist to inform the `/admin`
  approval decision. That decision is in practice made over private email with the
  person, so the fields buy nothing and cost two required inputs at the highest-friction
  moment in the funnel.

The establishment pick landed at signup on 2026-07-24 as an anti-fraud gate: only a real
school can open an account and start collecting minors' PII. That job has since moved.
Since the approval gate shipped on 2026-07-25, **every self-signup lands `pending` with
zero access until a human approves it**. A registry pick at signup no longer gates
anything the human review doesn't already gate, and it still happens — validated — at
onboarding.

## Goal

`/signup` requires full name, email and password. Nothing else.

## Non-goals

- Changing `/onboarding`. Step 1 already does the establishment capture correctly and is
  untouched by this work.
- Changing the approval gate, `set_initial_user_status()`, or `my_role()`. A self-signup
  still lands `pending`; its school is brand new and memberless, so the
  "joining an approved school" branch cannot match it — that holds whether the school
  row has a name or not.
- Restoring the lost `unknown` / `lookup_failed` distinction at onboarding (see
  "Accepted losses").

## Design

### 1. `/signup` — three fields

`app/(auth)/signup/page.tsx` drops the `SchoolCombobox`, the « Votre rôle » input and the
« Comment nous avez-vous connus ? » input, with their state, their validation branches in
`handleSignup`, and the `school_uai` / `school_name` / `school_country` /
`role_description` / `how_found_us` keys in the `signUp` metadata. The payload becomes:

```ts
options: {
  data: { full_name: name },
  emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
}
```

Unchanged: the Google button and its load-bearing `intent="organizer_signup"`, the
email/password-before-Google ordering, the legal footer, and the entire 6-digit
confirmation step.

### 2. `lib/auth/provision.ts` — one function

With no school in the metadata, `resolveSchool()` has no input to validate. It is
deleted, and with it the `unknown_school` and `school_lookup_failed` provisioning
failures. The email path becomes byte-identical to the Google path — read the name,
create a blank school, insert the profile, let the DB trigger decide status — so the two
exported functions collapse into one:

```ts
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult>
```

It keeps the OAuth path's `full_name || name` fallback for both callers (harmless for
email/password, where only `full_name` is ever set) and calls `createOrganizerAccount`.

`createOrganizerAccount` now has exactly one caller passing exactly one school value, so
its `school` parameter is dropped and `{ name: '', uai: null, country: 'FR' }` is inlined
at the `schools` insert. It also drops the `role_description` / `how_found_us` metadata
reads from the `users` insert, and the `schoolLabel` / `roleDescription` / `howFoundUs` /
`viaGoogle` arguments to `sendSignupRequestEmail`. Everything else stays: the existing-row
idempotency check, the school rollback on a failed profile insert, the awaited (never
fire-and-forget) emails, and reading `status` back from the insert to pick the redirect.

Call sites, all switching to the single name:

- `app/(auth)/signup/actions.ts` — `confirmSignupCode`
- `app/auth/confirm/route.ts` — the link-based confirm fallback
- `app/auth/callback/route.ts` — Google PKCE exchange (was `provisionOrganizerFromOAuth`)

### 3. `actions/public-schools.ts` — deleted

`searchPublicSchools` is the unauthenticated twin of `searchSchools`, and `/signup` was
its only consumer. It goes, with `actions/__tests__/public-schools.test.ts`. Deleting it
removes an anon-reachable server action from the surface.

`SchoolCombobox`'s injectable `search` prop existed solely to let `/signup` pass that
twin. The prop and its comment go; the component imports `searchSchools` directly again.

### 4. `/onboarding` — unchanged, now reached by everyone

`provisionOrganizer` creates a school with a blank name for every path, so
`mustOnboard(schoolName, ownedCount)` is true for every new organizer and
`app/onboarding/page.tsx` computes `initialStep = 1`. Step 1 then does what it already
does.

Deliberate side effect, and an improvement: the signup combobox was France-only with no
country selector, so an email/password signup could only ever be a French school and
foreign organizers were forced through Google. Onboarding step 1 offers all five locales
plus « Autre pays ». Moving the capture there restores that path.

### 5. `/admin` and the request email

`app/admin/page.tsx` drops `role_description` and `how_found_us` from the `Row` type, the
`select(...)` list, and the « Rôle : … · Nous a connus par : … » line.

`schools(name)` stays in the query — it is blank for a pending row and real once the
organizer finishes onboarding, which is worth seeing in the reviewed history. Its
empty-state copy « établissement non renseigné (Google) » is now wrong for every
provider and becomes « établissement pas encore renseigné ».

`sendSignupRequestEmail` in `lib/email.ts` drops the `schoolLabel`, `roleDescription`,
`howFoundUs` and `viaGoogle` options. With no signup-side detail, the `viaGoogle` note
(« Inscription via Google — aucun détail fourni. ») would fire for every request and is
removed rather than made unconditional. The body becomes name, email and the
« Examiner la demande » button; the subject loses its `— ${schoolLabel}` suffix.

`sendSignupFailureEmail` is untouched. Its surviving reasons are `missing_metadata`,
`school_insert_failed` and `profile_insert_failed`.

### 6. Migration

Both columns were added on 2026-07-25 (`20260725154243_signup_approval_gate.sql`) and are
written only by `provisionOrganizer`. Dropping them takes the stale write grant with
them:

```sql
alter table public.users
  drop column role_description,
  drop column how_found_us;

-- Re-issued without the two dropped columns. Same shape as the grant in
-- 20260725154243: revoke wholesale, then grant the exact self-writable set.
revoke update on public.users from authenticated, anon;
grant update (full_name, email, locale, exchange_order)
  on public.users to authenticated;
```

Applied staging-first, then prod via MCP `apply_migration`; `list_migrations` ledger
check; `generate_typescript_types` → `types/supabase.ts`; `npx tsc --noEmit`.
`pnpm test:rls` is required — this touches column grants on `users`.

## Accepted losses

**The `unknown` vs `lookup_failed` split** added on 2026-07-27 after a stale service-role
key made a total registry outage report as « we don't know that school » is deleted along
with `resolveSchool`. Correct: it guarded a signup-time lookup that no longer happens.
But the equivalent lookup still exists at onboarding (`searchSchools` in
`actions/onboarding.ts`) and does *not* draw that distinction — a registry outage there
surfaces as an empty result list, i.e. "no such school". Out of scope here; recorded so
it is a known gap rather than a silent regression.

**Intake context in the review queue.** `/admin` requests show name, email and signup
date. Per the decision behind this work, approval is made over private email with the
person, so the queue is a list of who is waiting, not a dossier.

## Testing

- `app/(auth)/__tests__/signup.test.tsx` — drop the combobox, role and how-found-us
  assertions and the `searchPublicSchools` mock; add one asserting the `signUp` metadata
  is exactly `{ full_name }`.
- `app/(auth)/signup/__tests__/page.order.test.tsx` — unaffected (asserts DOM order of
  the submit button vs the Google button). It must still pass untouched.
- `lib/auth/__tests__/provision.test.ts` — drop the `resolveSchool` cases (exact pair,
  UAI fallback, unknown, lookup-failed) and the metadata-trimming case; add one asserting
  every path inserts `{ name: '', uai: null, country: 'FR' }`; keep the idempotency,
  rollback, pending-email and failure-email cases against the single function.
- `actions/__tests__/public-schools.test.ts` — deleted with its subject.
- `app/onboarding/__tests__` — expected to pass unchanged; they are the regression net
  proving step 1 still works for the organizers now routed through it.

Gate before merge: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`.
