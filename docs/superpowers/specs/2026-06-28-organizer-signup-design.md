# Organizer Self-Signup — Design Spec

**Date:** 2026-06-28
**Status:** Approved (design); pending implementation plan
**Scope:** Free organizer + school account creation via email-confirmed self-signup. Billing is a separate, later sub-project.

## Goal

Let a new organizer create an account from the public landing page's "Get started" CTA: they sign up, confirm their email, and land on their dashboard with a freshly created school and an organizer profile. No invite required.

## Context

- The landing page (shipped) routes "Get started" → `/signup`, which does not exist yet. Today only `/login` and `/accept-invite` exist; account rows are created by organizers inviting students (`actions/students.ts` via the admin client).
- Schema (`supabase/migrations/20260624000001_initial_schema.sql`): `users` requires `school_id` (NOT NULL), `role` (`organizer`|`student`), `full_name` (NOT NULL), `email`. `schools` has `id`, `name`. A brand-new organizer therefore needs a `schools` row created at signup.
- Auth is Supabase with the SSR/PKCE token-hash flow. Email verification is centralized in `app/auth/confirm/route.ts`, which `verifyOtp`s then `redirect()`s (cookies persist only through that `redirect()`).
- Existing RLS already includes a `schools` insert policy and an "organizers read their school" policy.

## Decisions (from brainstorming)

- **School model:** signup always creates a **new** school (organizer owns it). Partner schools join later during exchange creation — out of scope here.
- **Billing:** **not** included. This builds free accounts; billing (Stripe checkout, webhooks, subscription/tier state, tier enforcement) is the next sub-project. Account creation is its prerequisite.
- **Email confirmation:** **required** before the account is active — mirrors the invite flow, prevents typo/junk accounts.
- **Provisioning approach:** **metadata + provision-on-confirm.** Name + school name are stored in auth user metadata at signup; the `schools` + organizer `users` rows are created (admin client) only after email confirmation. Zero orphan rows; idempotent; app-side; reuses the auth boundary.

## Flow (happy path)

1. Logged-out visitor clicks **Get started** → `/signup`.
2. Form collects **full name, school name, email, password**. Submit calls:
   `supabase.auth.signUp({ email, password, options: { data: { full_name, school_name }, emailRedirectTo } })`.
   No DB rows are written yet.
3. Page shows a **"Check your email to confirm"** state. No session exists yet.
4. Organizer clicks the email link → **`/auth/confirm`** verifies the OTP (`type=signup`) and establishes the session.
5. Inside `/auth/confirm`, for `type === 'signup'`, call **`provisionOrganizer(user)`**: if the user has no profile, create the `schools` row then the `users` row (`role='organizer'`, `full_name`/`email` from metadata) via the **admin client**. Idempotent.
6. `redirect('/dashboard')`.

## Components & files

- **Create** `app/(auth)/signup/page.tsx` — client form, styled like `app/(auth)/login/page.tsx` and `accept-invite/page.tsx`. Validation: all fields required; email format via `lib/validation` (`normalizeEmail`/`isValidEmail`); password `minLength={8}`. Renders inline errors and the post-submit "check your email" confirmation state.
- **Create** `lib/auth/provision.ts` — `export async function provisionOrganizer(user)`:
  - Input: the authenticated user object from `verifyOtp` (carries `id`, `email`, `user_metadata`).
  - Reads `full_name` and `school_name` from `user.user_metadata`.
  - If a `users` row for `user.id` already exists → return (idempotent no-op).
  - Else: insert `schools { name: school_name }` (admin) → get `school.id`; insert `users { id: user.id, school_id, role: 'organizer', full_name, email }` (admin).
  - On profile-insert failure after the school was created, delete the orphan school (mirrors `inviteStudent`'s auth-user rollback).
  - If `school_name`/`full_name` metadata is missing, do not provision — signal failure so the caller can redirect to an error.
  - Uses `createAdminClient` from `lib/supabase/admin` (service role; bypasses RLS).
- **Modify** `app/auth/confirm/route.ts` — after a successful `verifyOtp`, if `type === 'signup'`, call `provisionOrganizer(data.user)`; on failure `redirect('/login?error=signup_failed')`; otherwise `redirect(safeNext)` (`/dashboard`). The existing invite/other-type behavior is unchanged.
- **Modify** `middleware.ts` — add `/signup` to `isAuthRoute` (same treatment as `/login`): logged-out visitors can reach it; logged-in visitors are redirected to their dashboard.
- **Modify** `app/(auth)/login/page.tsx` (small) — surface `error=signup_failed` as a friendly message (reusing the existing `error` query-param pattern already used for `invite_invalid`).

## Data & security

- All creation goes through the **admin (service-role) client**, like `inviteStudent` — no new RLS policies needed; existing "read own row" + "organizers read their school" policies cover post-signup reads.
- `provisionOrganizer` is **idempotent**: re-running finds the existing profile and no-ops, so a double-clicked confirm link or a retry is safe.
- Inputs are trimmed and bounds-checked (non-empty `full_name`/`school_name`, reasonable max length); email normalized + validated. User-supplied strings are escaped wherever later rendered (consistent with project email/HTML rules).

## Edge cases & errors

- **Email already registered:** Supabase obfuscates this on `signUp` (no enumeration). The page shows the neutral "check your email" state regardless.
- **Provisioning failure or missing metadata:** redirect to `/login?error=signup_failed` with a friendly message; operation is safely retriable because it's idempotent.
- **Abandoned/unconfirmed signup:** nothing is written until confirmation — no cleanup required.
- **Concurrency:** two simultaneous confirms could theoretically create two schools; treated as an accepted low-risk edge for MVP (single-user confirm clicks), noted as a later hardening candidate.

## Supabase configuration (deploy step, not code)

The **"Confirm signup"** email template must point at the token-hash handler (same pattern as the invite template):

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard
```

This is a manual Supabase dashboard step and a required part of shipping this feature. Until it is set, confirmation links will not establish the SSR session (the "Auth session missing" class of failure previously seen with invites).

## Testing

- `app/(auth)/signup/page.tsx`: renders all fields; submit calls `signUp` with `options.data` metadata; shows the confirmation state on success; surfaces errors (mock the supabase browser client).
- `lib/auth/provision.ts`: creates school+profile when none exists; idempotent when a profile already exists; rolls back the school when the profile insert fails; signals failure when metadata is missing (mock the admin client).
- `middleware.ts`: `/signup` reachable when logged-out (no redirect to `/login`); logged-in visitor on `/signup` redirected to their dashboard (extend the existing middleware test).
- Run before completion: `pnpm lint`, `pnpm test`.
- Manual smoke (post-deploy, requires the email-template config): sign up → receive email → confirm → land on `/dashboard` with the new school + organizer profile.

## Out of scope (YAGNI)

- **Billing/Stripe** — next sub-project.
- Multi-organizer schools, join-existing-school, organization invites/codes.
- Password reset, social login, CAPTCHA / signup rate-limiting (later hardening candidate).

## Follow-up

- **CLAUDE.md** currently states the product is invite-only with no self-registration. Update that line as part of this sub-project so docs and behavior land together.
