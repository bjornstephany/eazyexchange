# Multi-Tenancy & Data Isolation — Design

**Date:** 2026-07-07
**Status:** Approved via brainstorm (Bjorn + Claude), pending spec review
**Sizing context:** Pre-PMF. Guiding rule agreed up front: cheapest option that
doesn't close a door; identify and document the one-way doors explicitly.

## 1. Tenancy model (as found in code — reference, not new work)

Shared database, shared schema, pooled tenants. The tenant is a **school**.
Rows carry `school_id` directly (`users`, `form_templates`, `applications`,
`organizer_invites`, `feedback`) or derive it via joins
(`assignment → template → school`, `submission → assignment → …`). Tenant
context is `auth.uid()` from the Supabase JWT, resolved to a school inside
`SECURITY DEFINER` helpers (`my_school_id()`, `my_role()`, and the derivation
helpers from `20260625000005_fix_rls_recursion.sql`). No session variables, no
middleware tenant context.

Enforcement zones:

- **Zone 1 — RLS-enforced (all authenticated traffic).** RLS on every table and
  on the `documents` storage bucket. Server actions re-check scope in app code
  (`assertOrganizer`, `assertExchangeInScope`, explicit `.eq('school_id', …)`)
  as redundancy. A forgotten WHERE clause here returns fewer rows, never
  foreign rows.
- **Zone 2 — service-role, app-enforced.** The unauthenticated application
  funnel (`actions/applications.ts`, `actions/join.ts`,
  `lib/auth/provision.ts`), Stripe webhook, billing routes, rate limiter, and
  the `send-reminders` edge function. Scoping = secret tokens + hand-written
  filters. This zone holds the product's most sensitive PII
  (`applications.data`: minors' health/family details).
- **Zone 3 — write-only-via-service-role tables** (`applications` inserts,
  `organizer_invites` writes, `feedback` reads/updates): the action code is the
  enforcement layer by design.

Boundary nuance: exchanges span two schools. RLS is school-scoped for most
tables but pair-scoped for `exchange_enrollments` (partner organizers see
enrollment rows, not user profiles). The tenant graph is one hop deep:
school ↔ partner school, per exchange.

## 2. Decisions

### D1 — Two-tenant RLS test suite + admin-client allowlist (build)

The RLS policies are the security layer and currently have zero automated
tests; every migration edits them blind. Detection of a cross-tenant leak
after the fact is not realistic at this stage (no audit log, short log
retention) — prevention-by-regression is the investment.

- **RLS suite:** seed School A + School B (plus a shared exchange) in local
  Supabase (`supabase start`), run queries as four personas (organizer A/B,
  student A/B) against every table and the `documents` bucket, assert
  cross-tenant reads return empty and cross-tenant writes fail. Runs in CI.
  Doubles as a compliance artifact for security questionnaires (see D4).
- **Allowlist:** a trivial test/lint that fails when a file outside a named
  list imports `lib/supabase/admin` (8 production files today). Makes the
  9th admin-client file a deliberate decision instead of drift.

### D2 — Funnel stays on the walled-in service role (decide + document)

Options considered: (A) keep service-role with enforced perimeter;
(B) move funnel into anon-callable SECURITY DEFINER RPCs; (C) anonymous
Supabase auth sessions. **Chosen: A.**

- Strongest case against A (accepted): the most sensitive PII stays protected
  by TypeScript diligence, not the database; the allowlist guards *where*
  admin code lives, not *what it queries*.
- B rejected: ossifies the fastest-iterating surface (the funnel changed
  repeatedly in two weeks), adds a PL/pgSQL review burden, and SECURITY
  DEFINER functions are their own vulnerability class.
- C rejected: rearchitecture of the funnel; anonymous auth users would pollute
  the invite-only enforcement in the OAuth callback.

Includes a one-paragraph rule in CLAUDE.md: *RLS is the isolation layer; the
service role appears only in the allowlisted files; any new import is a design
decision, not a convenience.*

### D3 — Small RLS hardening items (build)

- `feedback` INSERT `WITH CHECK` also pins `school_id = my_school_id()`
  (today only `user_id` is checked; any authenticated user can stamp another
  school's ID — trivial impact, but it is live drift).
- Audit pass: confirm every UPDATE policy has an explicit `WITH CHECK`
  (the `20260630` batch fixed `applications` and `exchanges`; the rest were
  not verified during the brainstorm).

### D4 — Noisy-neighbor: fair-share reminders + funnel sanity cap (build)

Principle agreed: instrument/cap only what protects tenants from **silent
starvation** or **outside abuse**; defer anything that punishes a successful
legitimate tenant with a guessed threshold.

- **Fair-share reminders:** `send-reminders` iterates schools in rotating
  order with a per-school per-run send budget; per-school send counts logged
  (counts only — no PII). Fixes: one big school exhausting the shared Resend
  quota, and deterministic starvation of schools late in iteration order if a
  run dies partway. `last_reminded_at` already makes re-runs idempotent.
  **Coordination:** the perf/cold-starts spec
  (`2026-07-07-perf-cold-starts-design.md`) already rewrites this query
  (filtered + paginated, fixing the 1,000-row truncation). Fair-share builds
  on that loop — sequence this work after it, in the same file.
- **Funnel sanity cap:** hard cap on `applications` rows per exchange
  (e.g. 2,000; exact number set in the plan) with a structured
  "applications closed" response past it. Pure abuse guard against rotating-IP
  bloat of the shared DB/storage; invisible to legitimate use.

Deferred with reasoning:

- **Per-school storage caps (both alert-only and hard):** real risk (project
  quota shared; per-file limits exist but no per-tenant total), but any
  threshold today is a guess that could block a real student's upload the
  night before a deadline. Revisit when a tenant's usage is observable.
- **Postgres query-load caps:** arrives with revenue attached; pooler metrics
  will show it coming. Nothing to do now.
- **Canary tenant / runtime leak detection:** theater at this scale.

### D5 — Dedicated DB / region demands: document the doors, build nothing

Findings recorded so future-us doesn't rediscover them:

- The pooled + RLS + `school_id`-spine model migrates to
  Supabase-project-per-tenant almost mechanically (same migrations, policies,
  code; different env). What does **not** port: the single-project
  assumptions — global `NEXT_PUBLIC_SUPABASE_URL`, one auth namespace/OAuth
  client/redirect config (all manual dashboard steps), single Stripe webhook
  target, `fra1`-pinned Vercel functions, cross-tenant platform reads
  (feedback triage).
- **The product-shaped constraint:** exchanges are edges between tenants.
  If isolation is ever sold, the deployable unit is an **exchange network**
  (a school + its partner schools as guests in its instance), not a school's
  extracted rows. This only stays true if the tenant graph stays one hop deep.
  **One-way door: do not build features that entangle a school in many other
  tenants' networks** (cross-network directories, global matching, etc.).
- Procurement reality: districts rarely need a literal dedicated DB — they
  need residency (already EU), a DPA, documented isolation (the D1 test suite
  is the artifact), and export/delete guarantees.
- **Per-tenant export** (one school's full row subgraph + storage objects):
  designated escape hatch and a standing GDPR obligation. **Deferred** —
  nothing about waiting makes it harder; build on first customer/data-subject
  demand.

## 3. Scope of the implementation plan

In scope (one plan): D1 (suite + allowlist), D2's CLAUDE.md rule, D3 (feedback
WITH CHECK migration + UPDATE-policy audit), D4 (fair-share reminders after
the cold-starts work lands; funnel cap).

Out of scope: everything listed as deferred above.

## 4. Testing approach

- D1 is itself the test infrastructure; new personas/fixtures become the
  regression net for D3's migration and all future RLS changes.
- Fair-share pacing logic extends `supabase/functions/send-reminders/pacing.ts`
  (pure, already vitest-tested) — budget/rotation math gets unit tests; the
  edge function loop is exercised against local Supabase if practical,
  otherwise reviewed manually on deploy (existing convention).
- Funnel cap: unit test on the structured result; rate-limit infra
  (`check_rate_limit`) is reused, not rebuilt.

## 5. Risks

- The RLS suite adds CI time and a local-Supabase dependency; if it flakes,
  it gets skipped and rots. Mitigation: keep fixtures minimal (two schools,
  one shared exchange), no UI, SQL/PostgREST only.
- Fair-share budgets mis-tuned → a legitimate big school's reminders spread
  over multiple days near a deadline. Mitigation: budget is per-run headroom
  (generous), not a punitive quota; log when a school hits it.
