# Ship gate

**Date:** 2026-07-28
**Status:** approved, ready to plan
**Scope:** sub-project B of three (see `2026-07-28-local-dev-loop-design.md` § Parent programme)

## Problem

Sub-project A made local development safe and fast. Nothing yet makes *shipping*
safe. Three gaps, in order of severity.

**No behavioural test exists.** 1927 unit tests pass while every page returns a
500: the suite mocks Supabase, so a server component that throws on real data is
invisible to it. The app's core loop — a student submits, an organizer approves —
has never been exercised end to end by a machine. Every regression in it has been
caught by a human clicking, or by a user.

**`test:rls` runs in CI but not before a push.** The pre-push hook runs lint, the
unit suite and `tsc`. A policy regression therefore survives locally and is caught
~8 minutes later by CI, after the push that triggered the deploy job.

**The full gate is a remembered ritual.** CLAUDE.md lists the commands to run
before merging. Running them means typing four commands and reading four outputs;
skipping one is silent.

What already exists and is *not* a gap: `.github/workflows/ci.yml` has run `unit`
(lint + `tsc` + test) and `rls` (`supabase start` + `test:rls`) on every PR and
push since 2026-07-09, with a `deploy` job gated on both. `vercel.json` sets
`git.deploymentEnabled.main: false`, so that job is the sole path to production.
The sub-project B row of A's table lists "GitHub Actions CI" as a deliverable;
that row is stale. B adds a third CI job, it does not build CI.

## Goal

One typed command verifies a branch completely, including its behaviour in a real
browser against a real database. The verification that protects production runs on
a machine that cannot be talked out of it.

## Design

### B1 · Three concentric rings

B's items are one idea at three strengths. Measured on this tree, 2026-07-28:
lint 2s, unit suite 63s (1927 tests, 242 files), `tsc --noEmit` 18s, `test:rls`
6.3s (197 tests), `next build` 54s.

| Ring | Trigger | Runs | Cost | Bypassable |
|---|---|---|---|---|
| 1 · pre-push hook | every `git push`, automatic | lint · test · `tsc` · **`test:rls`** | ~90s | `--no-verify` |
| 2 · `pnpm ship` | typed by hand, once per branch | ring 1 + `build` + **Playwright smoke** | ~4 min | by not typing it |
| 3 · CI | every PR and push to `main` | `unit` · `rls` + **`smoke`**, gating `deploy` | ~9 min, unchanged | no |

The rings are separate because their cost budgets differ. The hook fires on every
push including a README fix, so it must stay under roughly ninety seconds or
`--no-verify` becomes muscle memory — which rules out `build` (54s) and Playwright
there. `ship` runs once per branch and can afford four minutes. Both local rings
are bypassable by a human, which is precisely why the enforcing copy sits in CI.

### B2 · `pnpm ship`

**Verify only.** It runs the gate, prints a verdict, and touches git not at all —
no merge, no push, no deploy. A command that can deploy is a command that can
deploy by accident.

`scripts/ship.mjs`, following `scripts/dev.mjs`'s existing shape (step banner,
`die()` with the exact manual command on failure, no silent continuation).

```
1. GUARD: refuse to run unless the Supabase URL is local
2. lint (2s) · test:rls (6s) · tsc --noEmit (18s) · test (63s)   ← cheapest first
3. build (54s)
4. serve the build, run the Playwright smoke against it (~90s)
5. verdict
```

Two decisions carry weight.

**It builds, then tests what it built.** `build` is part of the gate and Playwright
needs a server, so the smoke drives `next start` on the production bundle rather
than `next dev`. One build serves both purposes, and the artefact under test is the
artefact that deploys.

**It refuses a remote database**, reusing A's `isLocalSupabaseUrl` from
`scripts/lib/local-target.mjs`. The smoke submits forms and approves them; it must
never be aimed at production, and `.env.prod` exists on this machine.

Steps run cheapest first so the common failure surfaces soonest: a lint error costs
2 seconds to learn about, not 4 minutes. `build` sits after the test steps because
it is also the smoke's setup, not because of its cost.

### B3 · The smoke suite

`playwright.config.ts` at the root, specs in `tests/smoke/`, chromium only.

| Spec | Journey | Assertion |
|---|---|---|
| `portals` | organizer dashboard; student checklist | both render signed-in against seeded data, no error boundary, counts match the manifest |
| `round-trip` | student fills a `data_entry` form → submits → organizer reviews → approves | status reaches `approved` on both sides |
| `apply` | `/apply/[slug]` → fill → submit → reopen by resume token | the anonymous funnel completes and the token reopens it |
| `signup` | `/signup` → confirmation mail in the local inbox → click | lands on `/pending` |

`portals` earns its place first: it catches the entire class of "a server component
threw and every page is a 500", which the mocked unit suite cannot see and which
has hurt this app more than any other failure.

**Sign-in goes through `/login`, never `/dev`.** A constraint, not a preference:
`next start` serves the production bundle with `NODE_ENV=production`, and `/dev`'s
first guard is `NODE_ENV !== 'production'`, so `/dev` correctly 404s under the very
server the smoke drives. Credentials come from `.seed-manifest.json` — A's existing
contract — so the smoke exercises the real authentication path. A useful side
effect: server-action error redaction is also live, so the suite observes
production error behaviour rather than dev's verbose messages.

**The signup spec asserts `/pending`.** A self-registered organizer creating a new
school lands `pending` under the approval gate. Asserting `/pending` tests the gate
working rather than pretending it is not there.

**The local inbox is Mailpit**, at `:54324`, API `GET /api/v1/messages` (verified;
it is not Inbucket, whose `/api/v1/mailbox` 404s). Supabase auth mail still lands
there despite A removing `RESEND_API_KEY`, because auth mail does not route
through Resend.

### B4 · Smoke isolation on a shared stack

The smoke mutates. There is exactly one local Supabase stack shared by every
worktree, and A deliberately made auto-seed non-destructive so a reseed never wipes
a parallel session mid-click. A run that approves a seeded student's form would
both change another session's world and fail on its second run, finding the form
already approved.

**Two students are reserved.** The cast gains `smoke-01` and `smoke-02`, shape
`untouched`, flagged `smoke: true` so `buildManifest` marks them and `/dev` can dim
them. No human is meant to click them. Two rather than one so a Playwright retry or
a second worker never contends on the same row.

**Reset reuses the seed's own shape logic.** Rather than a second state machine
that knows how to un-approve a submission, `seed-demo.mjs`'s per-student shape
application is extracted into a reusable function and called for the two reserved
students. No new understanding of the schema is introduced, and the reset cannot
drift from the seed.

**Reset runs per spec, not once per run.** A Playwright retry after a
half-finished mutation needs a clean slate as much as a first attempt does; a
`globalSetup` would run once and leave retries dirty.

The `signup` spec cannot use a reserved account — it creates one. It uses a
run-unique email; the resulting local cruft is cleared by `pnpm dev --reseed`, and
CI's database is fresh every run.

In CI none of this is needed, the database being new each time. The reset is a
local-only convenience, and is written so it is a no-op when the rows are already
in shape.

### B5 · CI

A `smoke` job, sibling to `unit` and `rls`, added to `deploy`'s `needs:` — the
enforcing copy of ring 2. Its steps mirror `rls` (whose `supabase start` is already
proven in CI), plus seed, `playwright install --with-deps chromium`, `build`, run.
Roughly 5–6 minutes, in parallel with the existing jobs, so CI wall-clock barely
moves from today's ~9 minutes.

Two risks to settle during planning rather than discover during it:

- **`build` in CI is new.** `unit` runs `tsc`, not `build`. The build reads
  `STRIPE_*` and the Supabase variables; the job must supply them. The local
  Supabase keys are fixed public constants already in
  `scripts/lib/local-target.mjs`; the Stripe values are dummy placeholders, since
  the smoke never reaches Stripe.
- **vitest would sweep the new specs.** `vitest.config.ts` excludes `tests/rls/**`
  and the worktree paths, but nothing else — `tests/smoke/**` must join that list
  or `pnpm test` will try to run Playwright specs.

Retries: 2 in CI, 0 locally. Failures upload the Playwright HTML report as an
artefact; a smoke failure with no trace is a smoke failure investigated by
re-running it locally.

### B6 · The pre-push hook

`test:rls` joins the hook. When the local stack is down — Docker Desktop closed on
Windows, the dominant local failure — the hook prints a loud
`RLS tests SKIPPED — stack down` banner and allows the push. CI runs `test:rls`
unconditionally and `deploy` is gated on it, so nothing unverified can reach
production; blocking a documentation push on Docker would buy no safety and would
make `--no-verify` habitual. Detection reuses the same 2-second probe of
`/rest/v1/` that `dev.mjs` already performs.

**The hook moves into version control.** Today it exists only in
`.git/hooks/pre-push` on one laptop: unreviewable, unreproducible, and lost with
the machine. The canonical copy becomes `scripts/hooks/pre-push`, with
`scripts/install-hooks.mjs` copying it into place and `pnpm wt` invoking that so
every worktree and every fresh clone gets the gate. `.git/hooks/pre-push` remains
the installed artefact rather than switching to `core.hooksPath`, which is a
global-ish setting this repo has no other reason to claim.

### Error handling

Every step announces itself and, on failure, prints the exact manual command to
reproduce it plus the most likely cause — the pattern `scripts/dev.mjs` already
uses. No step continues silently past a failure. The specific cases named:

| Failure | Message |
|---|---|
| Supabase URL not local | refuse, print the variable's value and the local block reference |
| stack down during `ship` | "Start Docker Desktop on Windows, then re-run `pnpm ship`" |
| smoke fails | the failing spec, the report path, and `pnpm exec playwright test --ui` to debug |
| port already bound | the pinned `.wtport` port and what to stop |

### Testing

`ship.mjs` and the hook are I/O orchestration, so tests target decisions, not
process spawns.

| Test | Subject |
|---|---|
| step ordering / fail-fast | a failing early step prevents later steps from running |
| local-URL guard | reuses A's `isLocalSupabaseUrl` cases; asserts `ship` refuses a remote URL |
| stack-probe predicate | up / down / timeout → run vs skip decision for the hook |
| reserved-cast invariants | `smoke-01`/`smoke-02` present, flagged, shape `untouched`, absent from the highlight set |
| shape-reset function | applying `untouched` to a dirtied student restores it; running twice is a no-op |

The smoke suite is itself the behavioural test and is not unit-tested.

Existing gates apply unchanged. No migration is added, so `test:rls` is not
triggered by this work — though this work does make it run more often.

## Out of scope

`pnpm wt new`, `docs/dev/HANDBOOK.md`, and the `CLAUDE.md` / `WORKFLOW.md` rewrites
are sub-project C. `pnpm ship` performing the merge is explicitly rejected, not
deferred. Visual-regression and cross-browser testing are not smoke testing.
Verifying production email templates stays manual: see the limitation below.

## Known limitation

The `signup` spec reads Supabase's **default local** auth templates from Mailpit,
not production's customised templates. The failure that actually broke signup on
this repo — the production template serving a dead `{{ .Token }}` code — would pass
this spec green. The spec proves the application's wiring; it does not prove the
production template. That verification remains manual, on staging or prod.

## Success criteria

1. `pnpm ship` runs lint, test, `tsc`, `test:rls`, `build` and the smoke suite, prints one verdict, and modifies no git state.
2. `pnpm ship` refuses to run, and starts nothing, when the Supabase URL is not local.
3. All four smoke specs pass against a freshly seeded local stack, and pass again immediately when re-run without reseeding.
4. A smoke run leaves the twenty human-facing seeded students byte-identical.
5. The CI `smoke` job is listed in `deploy`'s `needs:`; a deliberately broken critical path fails it and blocks the deploy.
6. `git push` with the stack up runs `test:rls`; with the stack down it prints the skip banner and proceeds.
7. `scripts/hooks/pre-push` is committed, and `pnpm wt` installs it into a fresh worktree.
8. `pnpm lint`, `pnpm test` and `pnpm build` pass.
