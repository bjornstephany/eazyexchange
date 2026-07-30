# Signup waitlist — replacing the `/admin` approval queue

**Date:** 2026-07-30
**Status:** approved, ready for planning
**Supersedes the operational half of:** `docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md`
(that spec's DB gate — `users.status`, `my_role()`, `set_initial_user_status()` — stays; only
its human review queue goes)

## Problem

Eazyexchange is not open to the public yet, so signup is gated. Today the gate is a
human one: every self-registered organizer lands `status = 'pending'`, sees `/pending`,
and waits for someone to click **Approuver** at `/admin`.

That has two costs.

The one that hurts daily: the owner needs to run the full signup → onboarding → walkthrough
cycle many times while building the product, and every single cycle requires going to
`/admin` and approving his own account. As of this writing his own production account
(`bjornstephany@gmail.com`, created 2026-07-30 16:57) is sitting `pending`.

The one that accumulates: every stranger who tries the product leaves behind a permanent
half-account — an auth row, a blank school, a `users` row — that has no access, no use, and
is awkward to delete (`public.users` is the target of four `NO ACTION` foreign keys).

## Solution

Move the decision from *after* the account exists to *before* it exists, and make it data,
not a click.

| | today | after |
|---|---|---|
| who decides | a human at `/admin`, after the fact | `signup_allowlist`, before the account exists |
| non-allowlisted person | full account, `pending`, stuck on `/pending` | no account at all — email captured on a waitlist |
| the owner's own email | approve himself every cycle | one allowlist row, forever |
| letting someone new in | click Approuver | `insert into signup_allowlist` in the Supabase dashboard |

`signup_allowlist` already exists (migration `20260725154243_signup_approval_gate.sql`) and
already works: `set_initial_user_status()` auto-approves any email found in it. Nothing
about the gate needs inventing. What changes is who consults it, when, and what everyone
else sees.

### Non-goals

- Removing `users.status` / `my_role()` / the trigger. See "What deliberately does not change".
- Any self-serve way for the owner to manage the allowlist from a UI. SQL in the dashboard
  is the interface, by choice.
- Emailing the waitlist at launch. That's a one-off `notified_at`-driven job for the day it
  happens, not part of this change.

## Data model

One new table, deliberately shaped exactly like its sibling `signup_allowlist`.

```sql
create table public.signup_waitlist (
  email       text primary key,   -- always stored lowercased
  full_name   text,
  source      text not null check (source in ('password','google')),
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  note        text
);

alter table public.signup_waitlist enable row level security;
-- No policies and no grants: service role only. The baseline default privileges
-- from 20260708000001 would otherwise hand anon and authenticated a grant, so
-- revoke explicitly — same reasoning as signup_allowlist.
revoke all on public.signup_waitlist from anon, authenticated;
```

`notified_at` is the only non-obvious column: when access does open up, the owner emails
this list, and needs to know who has already been told. Nothing in this change writes it.

Inserts are `on conflict (email) do nothing`. Signing up twice is idempotent and shows the
same message both times; the original `created_at` is preserved.

`source` distinguishes the password funnel from the Google one. It costs nothing and it is
the only way to tell, later, whether the Google path is working at all.

### Migration data changes

The same migration carries three one-off data fixes:

1. Seed `signup_allowlist` with `bjornstephany@gmail.com` and `pollystephany@gmail.com`.
   Written as an `on conflict (email) do nothing` insert so it is safe on every environment
   and survives a local `supabase db reset`.
2. Flip the existing production row for `bjornstephany@gmail.com` from `pending` to
   `approved` (and stamp `reviewed_at`). Without this the owner would have to delete and
   re-create his own account just to get in. Written as a plain `update … where email = …`,
   which is a no-op on local and staging.
3. Copy every remaining `pending` organizer's email into `signup_waitlist` with
   `source = 'password'` and an explanatory note, so they receive the launch email instead
   of being forgotten on a page nobody visits. Written set-wise —
   `insert into signup_waitlist (email, full_name, source, note) select … from users where
   role = 'organizer' and status = 'pending' on conflict (email) do nothing` — rather than
   naming an address, so it is correct on every environment, needs no existence guard, and
   is a no-op wherever there are no pending rows. Production currently has exactly one such
   row. Their `users` row is left in place: it stays `pending`, so it still has zero access,
   and deleting it would mean fighting the same four `NO ACTION` foreign keys the reset
   script exists to handle.

**Assumption, stated explicitly:** allowlisting `pollystephany@gmail.com` makes Polly a
*separate organizer with her own school*, because that is what a self-signup does. If she
were meant to be a second seat on the owner's school, the existing `/join` colleague-invite
flow covers that and she would not need the allowlist at all.

## Email/password signup

`app/(auth)/signup/page.tsx:48` currently calls `supabase.auth.signUp()` **from the
browser**. A client-side check cannot prevent an account from existing, so the submit moves
behind a single server action.

### `requestOrganizerSignup({ fullName, email, password })`

Lives in `app/(auth)/signup/actions.ts` alongside the existing `resendSignupEmail`.

1. Validate and normalize — `normalizeEmail`, `isValidEmail`, non-empty name. Same logic as
   today, relocated from the client.
2. Rate-limit by source IP through `lib/rate-limit.ts`, fail-closed, the same tier the
   anonymous apply funnel uses. The waitlist is an unauthenticated write to a table with no
   policies; it needs the same protection the funnel has.
3. Service-role lookup: is the normalized email in `signup_allowlist`?
4. **Not on it** → insert into `signup_waitlist` (`on conflict do nothing`), notify the
   owner, return `{ ok: true, state: 'waitlisted' }`. No auth user, no school, no `users`
   row, no confirmation email.
5. **On it** → `supabase.auth.signUp(...)` server-side with the same options as today
   (`data: { full_name }`, `emailRedirectTo: ${NEXT_PUBLIC_APP_URL}/onboarding`). On error
   return `{ ok: false, error }`; on success `{ ok: true, state: 'confirm' }`.

Every outcome is a structured return, never a throw — production redacts thrown Server
Action messages behind an opaque digest, so a thrown validation error would surface to the
user as nothing at all.

### Page states

`app/(auth)/signup/page.tsx` gains a third terminal state beside the form and the existing
"Vérifiez votre e-mail" screen: the waitlist message. Same `AuthCard` shell, French,
hardcoded like the rest of the auth pages (they are not in the `next-intl` catalogs).

Content: thanks, Eazyexchange is not open to everyone yet, we have saved your address and
will write to you as soon as it is. Plus the existing `contact@eazyexchange.com` line. No
sign-out link — there is no session.

The `?waitlisted=1` query parameter puts the page directly into this state on load, which
is how the Google path returns to it.

### Two accepted tradeoffs

**The password now transits our server** rather than going browser → Supabase directly.
This is what every classic login form does, there is precedent in
`actions/settings-password.ts`, and it is never logged. The alternative — a
`checkSignupEligibility(email)` action followed by a client-side `signUp` — keeps the
password off our server but lets a tampered client create accounts again, which defeats the
"no account at all" property this design is built on.

**The response reveals allowlist membership.** A waitlist message and a confirm screen are
distinguishable, so someone can probe whether a given address is allowlisted. The allowlist
holds a handful of the owner's own testers; the leak is "is this address one of Bjorn's
testers". Accepted.

## Google signup

`app/auth/callback/route.ts` already contains exactly the machinery this needs, for the
`not_invited` case: `supabase.auth.signOut()` followed by `admin.auth.admin.deleteUser`
wrapped in `withAuthAdminRetry`.

The `intent === 'organizer_signup'` branch gains an allowlist check before
`provisionOrganizer`. Not allowlisted → record the waitlist entry with `source = 'google'`
and the Google display name, then fall into that existing teardown, redirecting to
`/signup?waitlisted=1`.

Without this the Google button is a straight bypass of the entire gate. It is not optional.

## What deliberately does not change

**`users.status`, `my_role()`, `set_initial_user_status()` and `/pending` all stay.**

`my_role()` returns a role only when `status = 'approved'`, and roughly thirty table
policies, five storage policies and `claim_school()` are written as `my_role() = 'organizer'
AND …`, so they all inherit it — including policies not yet written. Removing it is a large,
high-risk migration that buys nothing: after this change it simply never fires for a new
account, because a non-allowlisted person never gets one. It remains the fail-closed backstop
if the application-layer check is ever bypassed.

`/pending` stays as the terminal page for the one legacy `pending` row in production, with
its copy rewritten to match the waitlist message. It is still excluded from middleware's
`isAuthRoute` list for the reason documented there — including it would redirect `/pending`
to itself.

**The `ADMIN_EMAILS` environment variable stays.** `lib/email.ts:367` reads it directly as
the recipient list for owner-facing alerts, independent of the helper being deleted. It is
where the waitlist notification goes.

## Removals

| Deleted | Justification |
|---|---|
| `app/admin/page.tsx`, `app/admin/actions.ts`, `app/admin/__tests__/` | the review queue is the thing being replaced |
| `lib/auth/admin.ts`, `lib/auth/__tests__/admin.test.ts` | `isPlatformAdmin` has exactly one consumer, `/admin`. Verified by grep: every other reference to `ADMIN_EMAILS` reads the env var directly |

`sendSignupRequestEmail` in `lib/email.ts` is repurposed as the waitlist notification. Its
body currently links to the `/admin` queue; that becomes a pointer to browsing
`signup_waitlist` in the Supabase dashboard. Recipients (`ADMIN_EMAILS`) and HTML escaping
are unchanged. It is still awaited rather than fire-and-forget, for the reason documented at
its call site: a `void` call is dropped when the serverless function freezes after the
response, which is exactly when the alert matters.

`sendSignupFailureEmail` is untouched — provisioning can still fail for an allowlisted user.

## `pnpm reset-account <email>`

Running the signup cycle repeatedly requires deleting the previous account, and
`public.users` is the target of four `NO ACTION` foreign keys, so this is not a one-click
dashboard delete. A script makes the cycle repeatable.

`scripts/reset-account.mjs`, resolving environment the same way `scripts/seed-demo.mjs`
does — it therefore points wherever `.env.local` points, which is the local stack by
default and production only if `.env.prod` is deliberately sourced.

### Guards, checked before anything is deleted

1. The target email must be present in `signup_allowlist`. This makes it structurally
   impossible to delete a real customer.
2. Every other member of the target's school must also be allowlisted. Refuses to nuke a
   co-owned school out from under a colleague.
3. Prints the exact row counts it will delete and requires `--yes`.

Unlike `pnpm seed`, this does not hard-refuse production — guard 1 is what makes that
acceptable.

### Teardown order

Derived from the live foreign-key graph, not guessed. The `NO ACTION` blockers are:

- on `schools`: `applications.school_id`, `exchanges.school_a_id`, `exchanges.school_b_id`,
  `form_templates.school_id`, `users.school_id`
- on `users`: `applications.reviewer_id`, `form_templates.created_by`,
  `organizer_invites.invited_by`, `submissions.reviewer_id`

Everything else (`assignments.student_id`, `exchange_enrollments.user_id`, `feedback`,
`application_custom_questions`, `organizer_invites.school_id`) cascades, and
`email_send_log.school_id`, `applications.enrolled_user_id`, `communication_events.actor_id`
are `SET NULL`. Order:

```
applications → submissions/assignments → form_templates → exchanges
  → users → schools → storage prefixes → auth.admin.deleteUser (per member)
```

Two details carry the value of the script:

- The `auth.admin.deleteUser` call goes through **`withAuthAdminRetry`**. A `bad_jwt` there
  leaves an orphan auth row, and the *next* signup then fails with `email_exists` — exactly
  the loop this script exists to escape. See `docs/security/supabase-secret-key-bad-jwt.md`.
- **Storage prefixes are purged too.** Otherwise every cycle silently accumulates the
  previous run's submission files and application portraits.

The plan should confirm the concrete table list against `information_schema`, and the
bucket list against the storage policies, at implementation time rather than trusting this
document — the schema moves, and a missed `NO ACTION` child turns the script into a
half-delete that leaves the account unusable *and* undeletable.

## Testing

**Unit (vitest).**
- `requestOrganizerSignup`: allowlisted → `signUp` called, `state: 'confirm'`; not
  allowlisted → waitlist insert, `signUp` *not* called, `state: 'waitlisted'`; duplicate
  waitlist entry → still `state: 'waitlisted'`, no error; rate limit exceeded → structured
  refusal; email normalization (mixed case, whitespace) hits the allowlist.
- `app/auth/callback`: `intent=organizer_signup` with a non-allowlisted email → waitlist row
  written, `signOut` and `deleteUser` called, redirect carries `waitlisted=1`; with an
  allowlisted email → `provisionOrganizer` called as today.
- The repurposed notification email: recipients, and that a hostile `full_name` is escaped
  in the rendered HTML.

**RLS matrix (`pnpm test:rls`).** `signup_waitlist` ships with matrix cases in the same PR,
per the project rule for new tables. Anon *and* authenticated must get zero rows on select,
and be denied insert, update and delete. This is the highest-value test in the change: the
table holds third-party email addresses and has no policies, so the grant revocation is the
only thing protecting it. A `grant to authenticated` is never exclusive of `anon` — both
must be asserted independently.

**Smoke (Playwright).** `tests/smoke/signup.spec.ts` currently asserts that a new organizer
lands on `/pending`; that assertion becomes false by design. It is replaced by two specs:

1. A throwaway address signs up → waitlist message rendered → `signup_waitlist` row exists →
   **no auth user was created**. Assertions must be positive: a thrown page returns HTTP 200
   with an empty shell, so "did not land on /pending" would pass on a crash.
2. An allowlisted address signs up → confirmation mail → `/onboarding`. This is the cycle
   the owner will run by hand repeatedly; it is worth having a robot check it.

The smoke run needs an allowlisted seed address, so `scripts/seed-cast.mjs` (or the smoke
manifest) gains one, and the seed inserts the matching `signup_allowlist` row.

**Deleted:** `app/admin/__tests__/`, `lib/auth/__tests__/admin.test.ts`.

**Updated:** `app/__tests__/pending.test.tsx` copy assertions, and `app/robots.ts` — its
disallow list carries `/admin` (line 34), which becomes a stale entry once the segment is
gone. `app/__tests__/seo-crawl-surface.test.ts` derives the route list from the filesystem
and asserts every non-public segment is disallowed, so it is the test that catches a
mismatch in either direction.

## Rollout

1. Write the migration locally as `supabase/migrations/<stamp>_signup_waitlist.sql`.
2. Apply to **staging first**: `set -a; source .env.staging; set +a; supabase db push --db-url "$STAGING_DB_URL"`.
3. Apply to production via the Supabase MCP `apply_migration` tool.
4. Check MCP `list_migrations`; if the ledger stamped a different version than the filename,
   `git mv` the local file to the stamped version, and update the staging ledger to match.
5. Regenerate types: MCP `generate_typescript_types` → overwrite `types/supabase.ts`
   verbatim → `npx tsc --noEmit`.
6. `pnpm lint && pnpm test && pnpm build`, plus `pnpm test:rls` and `pnpm ship`.
7. Merge to `main` after user confirmation; Vercel deploys production.

### Production verification

- Sign up with a throwaway address → waitlist message, `signup_waitlist` row present, no new
  `auth.users` row.
- Sign up with `bjornstephany@gmail.com` (after `pnpm reset-account`) → confirmation mail →
  `/onboarding`, no `/pending` stop.
- The Google button with a non-allowlisted account → waitlist message, no orphan auth row
  left behind.
- `/admin` returns 404.

## Documentation

`CLAUDE.md`'s "Signup is open but gated" bullet is rewritten: the gate is now
`signup_allowlist` consulted at signup time, `/admin` is gone, `signup_waitlist` captures
everyone else, and the `users.status` / `my_role()` layer remains as the fail-closed
backstop. The instruction to add allowlist rows by SQL in the Supabase dashboard belongs
there too — it is the only interface.
