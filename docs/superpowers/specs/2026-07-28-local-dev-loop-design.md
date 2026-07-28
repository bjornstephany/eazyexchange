# Local development loop

**Date:** 2026-07-28
**Status:** approved, ready to plan
**Scope:** sub-project A of three (see *Parent programme* below)

## Problem

`pnpm dev` on localhost talks to the **production** Supabase project. `.env.local`
carries the prod ref (`rgisrqlbcjdoetoybaqd`), so every local click reads and
writes real users' records — including minors' PII — and no test world can exist
locally, because `scripts/seed-demo.mjs` correctly refuses to seed production.

A local Supabase stack is already running on `127.0.0.1:54321` with all 67
migrations applied. It is simply unused.

Two consequences follow. Development is unsafe: an experiment on a branch mutates
live data. And development is slow: reaching a given app state means hand-driving
the funnel, so a screen is tested once and rarely re-tested.

## Goal

`pnpm dev` boots a running app against a **local** database populated with a
realistic exchange — 20 students spread across every form state — and one click
lands you in either the organizer or the student portal. Pointing local
development at production becomes impossible rather than merely discouraged.

## Parent programme

This is the first of three sequenced sub-projects. Each gets its own spec, plan
and implementation cycle.

| | Sub-project | Deliverables |
|---|---|---|
| **A** | **Local dev loop** *(this spec)* | env swap, 20-student seed, `/dev` page, self-healing `pnpm dev` |
| B | Ship gate | `pnpm ship`, Playwright critical-path smoke, GitHub Actions CI, `test:rls` in the pre-push hook |
| C | Parallel sessions + handbook | `pnpm wt new`, `docs/dev/HANDBOOK.md`, `CLAUDE.md`/`WORKFLOW.md` updates |

A is first because it is the daily payoff and because B's Playwright suite needs a
seeded local stack to run against. C is last so the handbook documents what was
actually built.

Governing principle across all three: **automate as much as possible.** Every
manual step becomes a command; every step that protects production is enforced by
a machine rather than by memory.

## Design

### A1 · Environment plumbing

`.env.local` is rewritten to target the local stack:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | local anon JWT (identical on every machine) |
| `SUPABASE_SERVICE_ROLE_KEY` | local service-role JWT |
| `STRIPE_*` | unchanged — already test-mode keys |
| `RESEND_API_KEY` | removed |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` — overridden at boot from `.wtport` (see A4) |

Three decisions carry weight:

**Prod values are archived to `.env.prod`.** Gitignored (`.gitignore` already
matches `.env*`), and deliberately *not* named `.env.production` — Next.js
auto-loads that filename during builds, which would silently rebuild against
production. `.env.prod` is inert: only a script that explicitly sources it can see
it. Routine production access stays with the Supabase MCP tools and the Vercel
dashboard.

**The Resend key is removed.** Today local dev holds a live key, so clicking
through the app attempts real sends; seed addresses are `@seed.example.com`, which
Resend rejects with a 422 that fails the whole batch. Without the key, sends
degrade to console warnings via the existing, tested path. Supabase *auth* emails
still work and land in the local inbox on `:54324`, so confirm and invite links
remain clickable. Real email rendering is verified with `scripts/smoke-email.mjs`
or on staging — never from the laptop.

**Worktrees inherit this for free.** `pnpm wt` symlinks `.env.local` into each
worktree, so one edit reaches every parallel session.

`NEXT_PUBLIC_APP_URL` stays in the file rather than being deleted: it is read
without a fallback in `app/(auth)/signup/page.tsx`, so an unset value would inline
the string `undefined/onboarding` into any local build. The file holds the
port-3000 default and `pnpm dev` overrides it in the child environment for
worktrees on other ports.

### A2 · Seed grows to 20 students

`scripts/seed-demo.mjs` already maps a `STUDENTS` list onto a `SHAPES` table
declaring which of the six forms sits at which status. Growing the cast is data,
not logic: eight more students, plus three shapes the current seven cannot
express.

| New shape | What it covers |
|---|---|
| `just-started` | exactly one draft — the "opened it once and stopped" case reminders target |
| `awaiting-review` | everything submitted, nothing reviewed — the organizer's real inbox state |
| `overdue-partial` | some approved, the past-deadline form untouched — mixed urgency in one row |

Two of the twenty are deliberate layout landmines: one very long hyphenated name
and one with heavy accents, so overflow and encoding bugs surface in the seed
rather than from a real family.

The nine applicants are unchanged — they already cover every funnel status.

The seed additionally writes `.seed-manifest.json` (gitignored): every account it
created, with role, display name, shape, and the seed password. This is the
contract consumed by A3 and A4.

**Cost.** Twenty students, nine applicants and two organizers is 31 auth users.
Local Supabase has no auth rate limit, so the run stays a few seconds. Staging's
free tier does (~2/hour), so `pnpm seed:staging` cannot create this cast in one
pass — an accepted, documented limitation, since staging seeding is rare and
manual.

### A3 · The `/dev` quick-access page

**Route:** `app/dev/page.tsx` — public, outside the auth route groups, with an
explicit allowance in middleware (which currently hard-gates unrecognised routes).

**Two independent guards, both server-side.** The page and its action each call
`notFound()` unless *both* conditions hold:

1. `process.env.NODE_ENV !== 'production'`
2. `NEXT_PUBLIC_SUPABASE_URL` points at `127.0.0.1` or `localhost`

Either alone would suffice; requiring both means a misconfigured build cannot
expose the route.

**Account discovery reads the manifest, not the database.** The page reads
`.seed-manifest.json`. No database query, no service-role client, and therefore no
change to the `lib/supabase/admin` import allowlist. A missing manifest renders
"run `pnpm seed`" rather than an error.

**Sign-in introduces no new authentication path.** A server action takes an email
present in the manifest, re-checks both guards, then calls the ordinary
`signInWithPassword` through the normal SSR client using the seed password, and
redirects to that role's home. It is exactly what `/login` performs, with the
typing done for you. Were the route ever to reach production, it would be a login
form that no real account can satisfy.

**Page contents:** the organizer, four highlighted students chosen to span the
interesting shapes (untouched / mixed / overdue / all-approved), the full roster
behind a disclosure, and links to the local inbox (`:54324`) and Supabase Studio
(`:54323`).

Being organizer and student simultaneously still requires two browser profiles —
one session, one cookie jar.

### A4 · Self-healing `pnpm dev`

`scripts/dev.mjs` grows from a port-aware wrapper into a short idempotent
sequence. Every step is near-instant when already satisfied.

```
1. Resolve port from .wtport                             (exists today)
2. GUARD: refuse to boot unless the Supabase URL is local
3. Stack down?         → pnpm exec supabase start
4. Migrations behind?  → pnpm exec supabase migration up --local
5. World absent?       → node scripts/seed-demo.mjs
6. Override NEXT_PUBLIC_APP_URL from the pinned port, boot Next
7. Print the banner: /dev URL, inbox, studio, what was seeded
```

Cold start ≈20s; warm start ≈1s.

**Step 2 is the point of the sub-project.** Once it exists, aiming local
development at production is not a discipline to maintain but an action the tool
declines. `pnpm dev --remote` remains for the rare deliberate case.

**Step 3 is viable from WSL.** The `docker` CLI is absent in this distro, but
`/var/run/docker.sock` is present and the bundled `supabase` CLI (a devDependency,
reachable as `pnpm exec supabase`) already drives it — verified with
`supabase status`.

**Step 4** compares migration filenames in `supabase/migrations/` against
`supabase_migrations.schema_migrations` using the `postgres` package already in
dependencies. No new dependency.

**Flags:** `--reseed` (rebuild the world), `--reset` (drop, re-migrate, reseed),
`--remote` (skip steps 2–5).

### Shared-stack concurrency

There is exactly one local Supabase stack, shared by every worktree — all sessions
address `:54321`. A reseed in one session therefore wipes the world another
session is mid-click in.

The design contains this by making **auto-seed non-destructive**: step 5 runs only
when the world is absent. Rebuilding is reachable solely through the explicit
`--reseed` / `--reset` flags. Destruction is always a decision, never a surprise.

Per-worktree databases were considered and rejected: separate schemas or ports
multiply migration state and Studio confusion for a hazard a single documented
rule already contains.

### Error handling

Each step announces itself and, on failure, prints the exact manual command and
the most likely cause. The dominant failure is Docker Desktop not running on
Windows, since WSL reaches the daemon through a socket it does not control; that
case is detected specifically (`supabase start` failing with an unreachable
daemon) and reported as "Start Docker Desktop on Windows, then re-run `pnpm dev`."
No step continues silently past a failure.

### Testing

The orchestration is I/O, so tests target decisions rather than process spawns.

| Test | Subject |
|---|---|
| `isLocal` predicate | remote URLs, localhost, 127.0.0.1, missing value |
| Port resolution | `.wtport` present / absent / malformed |
| Pending-migration diff | filenames vs. applied ledger rows |
| Seed invariants | 20 students, unique slugs, every referenced shape defined, manifest shape |
| `/dev` guards | production `NODE_ENV` → 404; remote Supabase URL → 404 |

The `/dev` guard test is the security-relevant one and is mandatory.

Existing gates apply unchanged: `pnpm lint`, `pnpm test`, `pnpm build`. No
migration is added, so `pnpm test:rls` is not triggered by this work.

## Out of scope

`pnpm ship`, Playwright, GitHub Actions CI, the pre-push `test:rls` hardening
(all B); `pnpm wt new`, `docs/dev/HANDBOOK.md`, `CLAUDE.md` and `WORKFLOW.md`
rewrites (all C). Local edge-function execution (`send-reminders`) is out of scope
for all three — the local `edge_runtime` container is currently stopped and
reminders are rehearsed on staging.

## Success criteria

1. `.env.local` contains no production credentials; `.env.prod` holds them, ignored by git and unread by Next.
2. `pnpm dev` from a clean stopped state yields a browsable, populated app with no other command typed.
3. `pnpm dev` exits with a clear error, and boots nothing, when the Supabase URL is not local.
4. `/dev` signs you into the organizer portal and into a chosen student's portal in one click each.
5. The seeded world holds 20 students covering every shape in `SHAPES`, including the three new ones.
6. `/dev` returns 404 under a production `NODE_ENV` or a remote Supabase URL, proven by test.
7. `pnpm lint`, `pnpm test` and `pnpm build` pass.
