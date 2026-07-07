# Test Coverage & Reliability Hardening — Design

**Date:** 2026-07-07
**Status:** Approved design, pending Bjorn's spec review
**Budget:** ~1 day, highest-leverage only. No new infrastructure (no Docker, no local Supabase stack, no paid GitHub features).

## Context

Assessment of the current state (2026-07-07):

- 88 test files / 555 tests, all green, ~31s. The pure-logic-extraction pattern is
  applied consistently (billing webhook resolver, reminder pacing, limits/plans,
  rollups, validation, email builders) and is the suite's strength.
- **No CI exists.** The only gate is the local pre-push git hook (lint + vitest +
  `tsc --noEmit`) — bypassable with `--no-verify`, absent on other machines.
  Vercel auto-deploys `main` to production checking only that the build compiles.
- **RLS** (CLAUDE.md's "most error-prone area") has four self-rolling-back SQL
  tests in `supabase/tests/` that nothing runs — they were one-off manual checks.
- **Stripe webhook route** (`app/api/stripe/webhook/route.ts`) swallows all DB
  errors and returns 200, so Stripe never retries a failed state sync. The pure
  resolver (`lib/billing/webhook.ts`) is well tested; the route is not.
- **send-reminders** orchestration (215 lines in `index.ts`) is untested; only
  `pacing.ts` math has tests.
- Untested server actions: `settings.ts` (307 lines), `students.ts` (163),
  `join.ts` (99).

Decisions taken during brainstorming:

- **Prod reality:** no real users yet — this work protects the launch, not live
  users. RLS/PII isolation is still the top-consequence bug class.
- **Idempotency:** already sound. Stripe Checkout owns charging (no double-charge
  surface in our code); webhook patches are absolute-state; the one stateful case
  (`grace_until`) is guarded; reminders stamp `last_reminded_at` only after a
  successful send.
- **Deploy gating approach:** CI owns production deploys (option A), chosen over
  "CI as alarm" and PR-gated branch protection.

## 1. CI owns production deploys

New `.github/workflows/ci.yml`, two jobs:

- **check** — on every push and PR: checkout, pnpm setup with store cache,
  `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm test`,
  `pnpm exec tsc --noEmit`. Same trio as the pre-push hook, same rationale:
  CI has no real env vars, so `tsc --noEmit` stands in for `pnpm build`;
  Vercel runs the real build at deploy time.
- **deploy** — `main` only, `needs: check`: deploy to production via the Vercel
  CLI (`vercel deploy --prod`) using repo secrets `VERCEL_TOKEN`,
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

Vercel git config change: add `git.deploymentEnabled.main: false` to the
existing `vercel.json` (currently `{ "regions": ["fra1"] }`) so pushes to
`main` no longer auto-deploy — CI becomes the only path to production. Branch
pushes keep automatic preview deploys (existing preview workflow untouched).

The pre-push hook stays as fast local feedback but is no longer the gate.

**Manual steps for Bjorn:** create a Vercel token; add the three GitHub Actions
secrets.

## 2. Stripe webhook hardening

Fix, then tests.

**Fix:** in `app/api/stripe/webhook/route.ts`, any Supabase error — the school
lookup or either `update` — returns **500** so Stripe retries with backoff
(up to ~3 days) and alerts on repeated failure. Today those errors are ignored
and the route returns 200, permanently dropping a paid subscription's state
change. "Customer not found" remains 200: genuinely nothing to do, and the
checkout route persists `stripe_customer_id` before the Checkout session
exists, so event ordering cannot cause a spurious not-found.

**Tests:** new `app/__tests__/stripe-webhook.test.ts` (mock the Stripe
signature check and the admin client, in the style of the existing route
tests):

- missing signature → 400; invalid signature → 400
- unhandled event type → 200, no DB call
- patch update error → 500
- grace branch: sets `grace_until` only when currently null; leaves an
  existing value untouched
- school lookup error → 500

## 3. Reminder filter extraction

Extract the per-row "should this assignment trigger a reminder" decision from
`supabase/functions/send-reminders/index.ts` into a pure function in a new
module beside `pacing.ts` (same Deno-compatible relative-import pattern;
vitest already picks up tests there, e.g. `pacing.test.ts`).

Covered cases: submission status `approved`/`submitted` → skip;
`draft`/`rejected`/none → remind; archived exchange → skip;
`reminders_enabled === false` → skip; missing deadline → skip; the PostgREST
array-vs-object submission shape.

`index.ts` keeps fetching, per-student grouping, sending, and stamping.
Behavior-identical refactor; redeploy manually afterwards
(`supabase functions deploy send-reminders`).

**Out of scope here:** the 1000-row PostgREST silent-truncation bug in the
same function — already specced in the perf cold-starts sub-project
(spec commit 94f2fb0). Coordinate at execution time if both land in the same
window.

## 4. RLS: convention now, harness later

No new infrastructure. Add a rule to CLAUDE.md (Gotchas/RLS area):

> Any migration that creates or alters RLS policies must end with running the
> SQL tests in `supabase/tests/` (via MCP `execute_sql`) and confirming each
> prints `ROLLBACK_OK`. They self-rollback and are safe against the real DB.

This turns the four existing tests (C1, H1, H2, L2) into a living gate.
A proper harness (local Supabase / pgTAP in CI) is **deferred** — and note the
multi-tenancy isolation spec (commit 8ecd104) already plans a D1 RLS test
suite. If that sub-project executes first, its suite supersedes this
convention's test list; the CLAUDE.md rule stays valid either way (run
whatever lives in `supabase/tests/` after RLS-touching migrations).

## 5. Non-goals (deliberate)

- No tests for `actions/settings.ts`, `actions/students.ts`, `actions/join.ts`
  — auth-gated CRUD; failures are visible and recoverable, unlike RLS/billing.
- No new component render tests (the suite already has plenty; marginal ones
  are maintenance burden).
- No checkout/portal route tests (mock-heavy, low signal; routes degrade
  gracefully to a user-visible notice).
- No coverage thresholds; no e2e/browser suite.

## Verification

- `pnpm lint && pnpm test && pnpm exec tsc --noEmit` green locally and in the
  new CI `check` job.
- Webhook: new route tests pass; a simulated DB failure returns 500.
- Reminders: extracted filter tests pass; deployed function behaves
  identically (spot-check one cron run's response counts).
- CI pipeline: a test push to a branch runs `check` only; a push to `main`
  runs `check` then deploys; a deliberately red test on a branch fails `check`.

## Rough sequencing

1. Section 2 (webhook fix + tests) — pure code, no setup dependency.
2. Section 3 (reminder extraction + tests).
3. Section 4 (CLAUDE.md rule) — minutes.
4. Section 1 (CI + deploy handover) last, after Bjorn creates the token and
   secrets; verify with a branch push before flipping `git.deploymentEnabled`.
