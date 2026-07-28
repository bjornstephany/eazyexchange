# Ship gate — verification record

Executed 2026-07-28 on `feature/ship-gate`. Companion to
`2026-07-28-ship-gate-design.md` (spec) and
`../plans/2026-07-28-ship-gate.md` (plan).

## CI evidence

| Run | Branch | Result |
|---|---|---|
| [#30386759498](https://github.com/bjornstephany/eazyexchange/actions/runs/30386759498) | `feature/ship-gate` (PR [#35](https://github.com/bjornstephany/eazyexchange/pull/35)) | `unit` 6m48s ✓ · `rls` 3m15s ✓ · `smoke` **6m25s** ✓ · `deploy` skipped |
| [#30387818451](https://github.com/bjornstephany/eazyexchange/actions/runs/30387818451) | `throwaway/prove-smoke-fails` (PR #36, closed) | `unit` ✓ · `smoke` **FAILED** on `portals.spec.ts` · `deploy` blocked |

The `smoke` job is 6m25s against the spec's 5–6 minute estimate — close
enough not to tune. It runs in parallel with `unit` and `rls`, so CI
wall-clock is unchanged.

**CI does not run on a branch push.** `ci.yml` triggers on `pull_request` and
pushes to `main` only, so verifying the gate needs a PR. The plan assumed a
branch push would do it.

## Criterion 5, and what proving it exposed

The deliberate break took two attempts, and the first attempt is the finding.

1. An unconditional `throw` at the top of `DashboardPage` made the rest of the
   function unreachable, so `tsc` failed — the **build** caught it and the
   browser suite never ran. That proves nothing about the specs. The break was
   made conditional (`if (process.env.NODE_ENV === 'production')`) so it
   compiles and fails only at runtime.
2. With a genuine runtime break, `smoke` failed — but only on *one* of the two
   portal tests. `every organizer page renders without an error boundary`
   stayed **green while `/dashboard` was throwing**.

Why: a thrown server component here does **not** produce a 5xx, and
`app/(organizer)/error.tsx` is a *client* boundary that never renders
server-side. Next returns **200 with the layout shell and no page content**.
Every absence-based assertion (`status === 200`, `not.toContainText(/Application
error/)`, and even a `data-testid` on `ErrorState`) therefore passed.

Fixed in `045cad2`: each organizer page is asserted to render its `<h1>` — a
positive assertion. Healthy pages render exactly one; a broken page renders
none. Verified red against the deliberate break, green on `main`'s behaviour.

**Generalisable lesson:** in this app, "the page did not error" is not
observable from the response. Smoke assertions must assert that content is
*present*.

## Local evidence

- `pnpm ship` — all six steps green, **256s** wall-clock, `git status` unchanged.
- `pnpm ship` with `NEXT_PUBLIC_SUPABASE_URL` pointed at a prod ref — refuses in
  under a second, prints the offending value, starts nothing.
- `pnpm smoke` run consecutively without reseeding — 6 passed, three times.
- The twenty `eleve-*` students after a full smoke run: 36 approved / 18
  submitted / 10 draft / 2 rejected — identical to a fresh `pnpm seed`.
- `bash scripts/hooks/pre-push` with the stack up runs `test:rls`; with the
  stack stopped it prints the skip banner and exits 0.
- `node scripts/install-hooks.mjs` installs into the common git dir; a second
  run is silent.

## Bugs found while building the gate

Three pre-existing defects, each blocking the suite and each fixed here.

1. **Seeded organizers were `pending`** (`f541358`). Inserted without an explicit
   `status`, so the column default stuck — `set_initial_user_status()` only
   auto-approves students, allowlisted addresses, or someone joining an
   already-approved school, and a seeded owner's school is brand new. They were
   invisible to `my_role()`, so every organizer RLS policy denied *silently*:
   the seed's own approvals matched zero rows (the roster claimed "every
   completion state covered" while the database held **0 approved, 0 rejected**),
   and `/dev` organizer sign-in landed on `/pending`.

2. **`check_rate_limit` was never granted to `service_role`**
   (migration `20260728180000`). `20260630000004` revoked EXECUTE from
   `public, anon, authenticated` on the stated belief that "the admin
   (service-role) client bypasses these grants". It does not. That only appeared
   to work because older projects carry PostgreSQL's default PUBLIC EXECUTE,
   which `service_role` inherited. Every fresh `supabase start` revokes that
   default, leaving the ACL `{postgres=X/postgres}` — so the call failed with
   `permission denied`, and `lib/rate-limit.ts` fails **CLOSED** for mail-sending
   caps. The anonymous application funnel refused every application, locally and
   in CI. Ships with RLS matrix cases in `tests/rls/rpc.test.ts`.

   **Not yet applied to staging or prod.** On prod the implicit grant is
   presumably still in place (the funnel works there), which makes this
   migration a no-op — but it must still be applied staging-first, per
   `CLAUDE.md`.

3. **Middleware redirects resolve to `localhost`** regardless of bind address
   (`d3a9723`). `NextResponse.redirect(new URL(dest, request.url))` emitted
   `http://localhost:PORT/...` while the browser's origin was `127.0.0.1:PORT`,
   so the RSC prefetch of `/` was blocked by CORS and client-side `router.push`
   navigations stalled. The suite now serves and browses on `localhost`, and
   `NEXT_PUBLIC_APP_URL` must match at **build** time (it is inlined) — which is
   why `scripts/ship.mjs` sets it and the CI job pins
   `NEXT_PUBLIC_APP_URL: http://localhost:3000`.

## Deviations from the plan

- **A migration was added.** The plan states "no new migration is added by this
  work". Finding (2) made the `apply` spec impossible without one.
- **`round-trip` asserts outcomes, not navigations.** The plan waited on the
  `router.push('/my-forms')` that `FillableForm` fires on success. That push
  stalled intermittently under two-worker load *while the submission itself
  landed correctly*, so the spec now polls the dossier with `expect(...).toPass()`.
  The same change was made to the organizer's `router.back()` after approval.
  **The intermittent stall is a real client-side navigation flake and is not
  fixed here** — worth its own investigation.
- **The resume-token regex.** The plan expected a UUID; `lib/tokens.ts`
  `randomToken()` produces 24 random bytes as base64url. The seed's fixtures use
  `randomUUID`, the funnel does not.
- **Chromium installed without `--with-deps`** (needs sudo on WSL). It launches
  fine; CI still uses `--with-deps`.

## Still not covered

**Production's auth email templates.** `supabase/templates/confirmation.html` is
a committed *copy* of the template recorded in `docs/DEPLOY.md`. The smoke proves
the application's wiring — `/auth/confirm`, the OTP exchange, `provisionOrganizer`,
the `/pending` landing — but a drifted dashboard template in production would not
fail this gate. That check remains manual, on staging or prod.
