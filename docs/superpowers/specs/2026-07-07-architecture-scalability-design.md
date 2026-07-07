# Architecture & Scalability Review — Design

**Date:** 2026-07-07
**Status:** Approved by Bjorn
**Scope:** Where the current architecture bends on the way to ~300 schools, which scaling moves are premature, and the three changes worth making now.

## Context

EazyExchange is a single Next.js 14 App Router monolith on Vercel (fra1) with Supabase as the entire backend (Postgres + RLS, Auth, Storage), Resend for email, Stripe for billing. Mutations go through Server Actions; the only API route is the Stripe webhook; one Edge Function (`send-reminders`) runs daily. No cache layer, no queue, no background workers beyond that cron.

Production scale at time of review: 3 schools, 4 users, 1 exchange, 0 submissions, 12 MB database. Growth hope: hundreds of schools within 12–18 months, unproven.

**Growth shape (confirmed):** the product stays per-school. A partner school may sign up later via referral and creates its *own* exchange — two organizers never collaborate on the same exchange record. Every tenant is therefore fully independent, and scaling is N copies of a small workload. This is the assumption that makes everything below true; it is revisited only if shared cross-school exchanges enter the roadmap (see Reopening triggers).

## Findings: where it bends first (in order)

At ~300 schools: ~150 active exchanges, ~6,000 students, ~70k assignments, ~1M rows total. Postgres does not notice this — the database, dashboard grid (~500 cells per tenant), Vercel compute, Auth, and Stripe are all fine as-is.

1. **The reminder cron has the only hard ceiling.** `send-reminders` sends sequentially through Resend; deadline weeks at ~30–50 active exchanges produce enough sends to hit Resend rate limits or the Edge Function wall-clock limit. Failure mode: *partial* runs — students early in iteration order get chased, the rest silently don't. **Early signal:** function execution duration in Supabase logs trending up; Resend 429/5xx errors.
2. **Email is an unauditable side effect.** Sends happen inline in server actions with no record. At scale, "the family never got the invitation" becomes a weekly support question with no way to answer it. **Early signal:** the first support question that requires grepping Resend's dashboard.
3. **RLS change velocity.** A large fraction of the 40 migrations are fixes/hardening of earlier policies. The failure mode is not performance but cross-tenant exposure of minors' data, and the cost is fear-driven slowdown on every RLS-touching feature. **Early signal:** already visible in the migration history.
4. **Previews shared production data** (decision of 2026-07-06, now reversed). Unreviewed branch code auto-deployed by Vercel had full read/write access to production PII. No early-warning signal exists for this class of risk. Previews are used for testing only (confirmed), so separation is a pure win.

## Rejected: the classic scaling playbook

All premature at this scale and shape; consciously not done:

- **Caching** — data is per-tenant, personalized, tiny; buys milliseconds, sells staleness bugs in a product whose value is "is this status current?"
- **Queue infrastructure** (SQS-style / Vercel Queues) — the one async workload (email) fits a Postgres table + the existing cron.
- **Read replicas** — a few GB with per-tenant access patterns even at 300 schools.
- **Sharding** — RLS tenant isolation already is row-level sharding.
- **Service splitting** — solo developer; the monolith (one deploy, one type system, actions → DB) is the correct shape. Splitting pays network/versioning/observability tax to solve a team-coordination problem that doesn't exist.

## Decisions: three changes, in order

### 1. Preview/staging environment split (do first, ~an afternoon)

Create a second free-tier Supabase project (`eazyexchange-staging`). Apply the same `supabase/migrations/` to it; create buckets and deploy the edge function once; configure auth redirect allow-list for Vercel wildcard preview URLs; seed one fake school/organizer/students. In Vercel, re-scope env vars: Production keeps real keys, **Preview scope gets staging keys**.

- **Buys:** previews physically cannot touch real data; staging becomes a migration rehearsal target (catches db-push drift-trap failures before prod).
- **Recurring cost:** every migration applied twice — make "apply to staging" the *first* step of every migration task, never optional.
- **Failure modes:** staging drift if applies are skipped (previews break mysteriously); false confidence from 5-row seed data hiding real-shaped-data bugs. Gotcha: free-tier auth email is ~2/hour without custom SMTP — wire Resend SMTP into staging if email flows need preview testing.

### 2. Email send log now (~1 hour); outbox worker only on signal

**Now:** one table logging every send attempt (recipient, template/kind, exchange, status, error) written by the existing send helper. The table contains parents' emails — it is PII and gets full RLS treatment (organizer reads own school's rows only), not a casual audit table.

**Later, parked:** full outbox — server actions insert rows, a worker sends and marks them, the reminder cron becomes "page through pending" and the wall-clock ceiling disappears. **Trigger to build it:** `send-reminders` duration trending toward the function limit, or 429s appearing in the send log. Not before.

- **Failure modes:** double-sends (worker crashes after send, before mark → parent gets three reminders → spam-flagged); requires idempotency discipline from day one. Scope creep: the log is an hour only if the worker waits for its signal.

### 3. RLS regression harness (~a day)

Seeded fixtures: two schools, one organizer + student each; assertion tests that school A's organizer cannot read school B's rows across every table, plus role checks (student can't review, etc.). Runs against a local Supabase stack, or — fallback if CI plumbing fights back — against the staging project from item 1. Every new table/policy gets a test; every past `fix_*` class gets a tripwire.

- **Buys:** removes the fear tax on the empirically most error-prone surface.
- **Failure modes:** false confidence (tests only catch imagined leaks — the harness supplements paranoia, never replaces it); fixture maintenance.

**Sequence:** 1 → 2-log → 3 → (2-outbox parked on trigger). ~Two days total, zero new infrastructure products, addresses all four bend points.

## Reopening triggers

- **Shared cross-school exchanges** enter the roadmap → reopen the data-model/RLS design (the one genuinely hard growth path).
- **Whole-school usage** (hundreds of students per school, many concurrent exchanges) → revisit dashboard grid fetch and reminder pacing volume.
- **`send-reminders` duration or 429s** → build the outbox worker (item 2, parked).
- Everything in the Rejected list stays rejected until one of the above fires.
