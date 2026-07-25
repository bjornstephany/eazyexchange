# Signup approval gate — design

**Date:** 2026-07-25
**Status:** approved, ready for planning

## Problem

Public signup is open and provisions a working organizer account the moment the
6-digit code is confirmed. The app is not ready for public use. On 2026-07-24 a
stranger signed up unprompted.

Signup must **stay open** — a real prospect raising their hand is the point —
but a new account must have **zero access** until it is approved by hand.
Specific testers must be able to skip the queue.

## Non-goals

- Gating students. They are invite-only, created by an already-approved
  organizer, and never see the approval surface.
- Gating the anonymous funnel (`/apply`, `/join`, `/invite`). Those serve
  parents who have no account at all and must keep working.
- Any change to billing. Trial/plan limits are a separate axis that continues
  to apply on top of approval.

## Starting state (verified against prod, 2026-07-25)

- `public.users` **is** the profile table (`id → auth.users`, `school_id NOT
  NULL`, `role`, `full_name`, `email`, `org_role`, `locale`, `exchange_order`).
  There is no separate `profiles` table and there will not be one.
- All 22 public tables have RLS enabled. `error_reports` and `rate_limits` have
  zero policies (service-role only, intentional). The only `USING (true)` is
  `school_registry` — a public directory of 14,613 French schools, no PII.
- **Every organizer-reachable policy is written as `my_role() = 'organizer'
  AND …`** — ~30 table policies plus 5 storage policies. `claim_school()`, the
  only path that can name a school, checks `my_role()` internally too.
- Storage: 3 buckets, all `public: false`.
- `authenticated` and `anon` hold `UPDATE` on every column of `public.users`;
  escalation is blocked only by the `guard_user_immutable_fields()` trigger
  (`role`, `school_id`, `org_role`). `anon` also still holds `UPDATE` on all of
  `schools` — inert, since no UPDATE policy exists for it, but latent.
- `provisionOrganizer()` (`lib/auth/provision.ts`, service role) creates a
  school with an **empty name** plus the `users` row. `/onboarding` then forces
  the school name (registry combobox) and the first exchange.
- `marvanemust@gmail.com` (auth id `374a7a59-f9de-44a0-a519-c642b9e3b9df`)
  confirmed their email at 2026-07-24 16:04 UTC but **provisioning failed** —
  no `users` row, no school. They currently hit `/login?error=profile_missing`.
- 3 orphan zero-member schools remain: `Test`, `Test`, `Edina`.

## Design

### 1. Schema

`public.users` gains five columns:

| column | definition |
|---|---|
| `status` | `text not null default 'pending'`, `check (status in ('pending','approved','rejected'))` |
| `role_description` | `text` — their role at the school, from signup |
| `how_found_us` | `text` — from signup |
| `reviewed_at` | `timestamptz` — set on approve/reject |
| `notes` | `text` — private reviewer note |

There is deliberately **no `organisation` column**. The school is picked from
`school_registry` at signup and written onto the `schools` row by
`provisionOrganizer` using the service role, re-validated against the registry
by `(uai, name)` with the same precedence `claim_school()` uses — exact pair
first, then lowest `id` for that UAI — so a crafted request cannot spoof a name
the registry does not carry. Consequences: `/admin` shows a real UAI-matched
school, and after approval `/onboarding` opens on step 2 (first exchange)
because step 1 is already satisfied.

New table `public.signup_allowlist`:

```sql
create table public.signup_allowlist (
  email      text primary key,          -- stored lowercased
  note       text,
  created_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security;
-- no policies, and no grants to anon/authenticated: service role only
```

### 2. The gate — RLS

A single helper change gates ~30 table policies, 5 storage policies, and
`claim_school()`:

```sql
create or replace function public.my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from users where id = auth.uid() and status = 'approved'
$$;
```

Chosen over AND-ing a new `is_approved()` into each policy because it is one
edit instead of ~35, and because it **fails closed for future policies**: any
new policy written in the house idiom inherits the gate. The cost is that
"role" and "approval" are conflated in one helper — mitigated by a comment
block on the function and by RLS matrix cases that assert the behaviour
directly.

`is_approved()` is deliberately **not** added. One gate in one place; a second
helper invites policies that use one and not the other.

`my_school_id()` is deliberately **left alone**. A pending user therefore keeps
exactly three capabilities, which is what `/pending` needs and no more:

- read their own `users` row (`users` → `students read themselves`)
- read their own `schools` row (`schools` → `users can read their school`)
- insert `feedback` (so they can still tell us something)

Everything else — every exchange, template, assignment, submission, upload,
application, enrollment, info card, communication event, audit row, email log
row, and both private buckets — is denied.

### 3. Status is not self-writable

Enforced by **column grant**, following the `schools.name` precedent from
`20260725122126`, not by a trigger:

```sql
revoke update on public.users from authenticated, anon;
grant update (full_name, email, locale, exchange_order,
              role_description, how_found_us)
  on public.users to authenticated;
```

`status`, `reviewed_at` and `notes` simply have no grant, so a self-update
cannot touch them regardless of policy. This also closes the latent `anon`
UPDATE grant noted in the starting state. The existing
`guard_user_immutable_fields()` trigger stays as the second layer for `role` /
`school_id` / `org_role`. A grant is preferred over extending that trigger
because the trigger fires for the service role too, and the admin review action
must be able to write `status`.

### 4. App layer

**Deliberate deviation:** no status lookup is added to `middleware.ts` as a
per-request DB call. RLS is the gate; this layer only decides what people see.

- `middleware.ts` already selects from `users` for logged-in users hitting `/`
  or an auth route. `status` joins that existing `select` at no extra cost, and
  pending/rejected users are sent to `/pending` rather than `/dashboard`.
- Every other route is covered by layouts that already call the request-cached
  `getProfile()`, also at no extra cost: `app/(organizer)/layout.tsx`,
  `app/(student)/layout.tsx`, `app/onboarding/page.tsx`, and the `/billing`
  routes each gain a `status !== 'approved' → redirect('/pending')` check
  immediately above the existing `mustOnboard` gate.
- `/pending` gets an **early return** in `middleware.ts`, next to the existing
  `/auth` early return — *not* an entry in `isAuthRoute`. Putting it in
  `isAuthRoute` would make the "logged-in user on an auth route" branch redirect
  a pending user from `/pending` to `/pending`: an infinite loop and a blank
  tab, the same failure mode `shell-destination.ts` was written to prevent.
  An approved user who lands on `/pending` is redirected onward by the page
  itself, not by middleware.
- `Profile` in `lib/supabase/request.ts` gains `status`.

**`/pending`** — `AuthCard` styling, French, consistent with `/login`. Copy
differs by status: `pending` says the request is under review and we will be in
touch; `rejected` says access cannot be opened right now and gives
`contact@eazyexchange.com`. Showing "under review" forever to someone already
rejected is a lie the page should not tell.

**`/admin`** — top-level `app/admin/`, deliberately outside the `(organizer)`
route group so it takes neither the organizer shell nor the onboarding gate.
Server-rendered; `notFound()` unless the session email is in `ADMIN_EMAILS`
(env allowlist — no DB row to escalate, and it cannot be reached through RLS
because it does not live in the database). Lists `users` newest first: email,
full name, school name, `role_description`, `how_found_us`, `status`,
`created_at`, `reviewed_at`, `notes`. Approve / Reject are server actions in
`app/admin/actions.ts` on the service-role client, setting `status` and
`reviewed_at`; `app/admin/actions.ts` is added to the allowlist in
`lib/supabase/__tests__/admin-allowlist.test.ts`.

**`/signup`** gains three fields — school (registry combobox), role, how did
you hear about us — passed through `signUp options.data` and read by
`provisionOrganizer`. `SchoolCombobox` is reused unchanged, but `searchSchools`
(`actions/onboarding.ts`) is `requireOrganizer()`-gated, so an anonymous
sibling is added. **Accepted risk:** that endpoint is unauthenticated and
unrate-limited. `lib/rate-limit` fails *closed*, so a limiter outage that
blocks signup is worse than scraping a registry that is already a public
download from data.gouv.fr. Same reasoning already recorded on `searchSchools`.

Non-French schools keep the existing behaviour: no free-text fallback, the
« Je ne trouve pas mon établissement » path points at `contact@eazyexchange.com`.
The registry gate simply moves earlier in the funnel.

### 5. Pre-approval

`provisionOrganizer` sets `status = 'approved'` when `lower(email)` exists in
`signup_allowlist`, otherwise `'pending'`. Adding a tester later is one insert
via MCP — no redeploy, no code change, effective on their next signup.

The table ships **seeded empty**; that is the point of choosing a table over an
env var. Seed rows can be added any time.

### 6. Notification

`sendSignupRequestEmail()` is added to `lib/email.ts` beside the 18 existing
senders, following `sendFeedbackNotificationEmail` exactly: HTML-escaped,
logged to `email_send_log`, never throws. Called fire-and-forget from
`provisionOrganizer` after the `users` insert, with a link to `/admin`.

Chosen over an Edge Function + Database Webhook because it needs no second
deploy target, no dashboard step, and works on staging and under test — whereas
a webhook would be untestable on staging (no `RESEND_API_KEY` there) and
requires a manual `supabase functions deploy`.

**The failure path notifies too.** `provisionOrganizer` returning `!ok`
currently redirects to `/login?error=signup_failed` and leaves no trace — no
row, no email, nothing. That is precisely how the 2026-07-24 signup was nearly
missed, and a webhook on `users` INSERT would have the identical blind spot
(no row ⇒ no webhook). A failed provision therefore sends its own notification.

### 7. Google OAuth — known limitation

Google returns name and email only, so `provisionOrganizerFromOAuth` cannot
populate school, role, or how-found-us. Decision: **keep the Google button.**
Those signups land `pending` with blank intake fields, `/admin` marks them
"via Google — no details", and after approval they pick their school at
`/onboarding` step 1, which still works for a blank school name. The rejected
alternative was removing Google from `/signup`.

## Migration & rollout

One migration, one transaction, in this order:

1. add the five `users` columns and `signup_allowlist`
2. replace `my_role()`
3. revoke/re-grant `users` column privileges
4. backfill:
   - `bjornstephany+testorganizer@gmail.com`, `bjornstephany+teststudent@gmail.com` → `approved`
   - `marvanemust@gmail.com` → stub school + `users` row with `status = 'pending'`, so the request appears in `/admin` and they see `/pending` instead of a broken login
   - delete the 3 orphan schools **by explicit id**
     (`c015a2be-071f-4ac3-8285-ecac22e68f31`,
     `aa666ac1-12cd-48b4-a06e-a86fb41dd4f9`,
     `7e7c2f60-bf3a-4e82-90ec-4b0ed1c5886c`) — not by a "zero members"
     predicate, which is order-dependent against the stub school created above

**The backfill must be in the same transaction as step 2**, or every existing
organizer is locked out between statements.

Then: staging first
(`supabase db push --db-url "$STAGING_DB_URL"`), prod via MCP
`apply_migration`, `list_migrations` drift check, regenerate `types/supabase.ts`,
`npx tsc --noEmit`.

Env: `ADMIN_EMAILS` added to Vercel on all three targets and to `.env.example`.
Default value `bjornstephany@gmail.com`.

## Verification

- **RLS matrix** (`tests/rls/`): a pending organizer is denied on every
  organizer-facing table and both private buckets, and still reads their own
  `users` and `schools` rows. An approved organizer is unaffected.
- **Gate test**: anon-key client signs in as a pending user and attempts reads
  and writes across the app tables; all denied.
- **Non-vacuousness**: each denial test flips the fixture to `approved`
  mid-test and asserts access appears — the technique used for the
  `schools.name` grant work, which proved a deny-test can pass for the wrong
  reason.
- **Unit**: allowlist branch in `provisionOrganizer`, registry re-validation of
  the signup school pick, `isPlatformAdmin`, middleware routing for each
  status, `/pending` copy per status, `/admin` 404 for non-admins.
- Full gate: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`.

## Open inputs

Neither blocks implementation; both have working defaults.

1. `signup_allowlist` seed rows — none known yet; table ships empty.
2. `ADMIN_EMAILS` — defaults to `bjornstephany@gmail.com` alone.
