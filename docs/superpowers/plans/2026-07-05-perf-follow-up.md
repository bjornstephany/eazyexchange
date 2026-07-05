# Perf follow-up: verify & merge round-trip branch, then DB migrations

**Context (2026-07-05).** A perf audit found nav/click lag was server-side round-trip
multiplication (not client re-renders). The code fixes are complete and committed on
branch `perf/round-trip-reduction` (single commit `d7f6ce9`, 404/404 tests, lint +
`tsc --noEmit` clean). This plan covers what remains. Zero conversation context needed:
everything to execute is in this file plus the branch diff.

## What's already on the branch (do not redo)

1. `vercel.json` pins functions to `fra1` — they ran in `iad1` while Supabase is in
   `eu-central-1` (~100 ms × ~10 sequential round trips per navigation).
2. `lib/supabase/request.ts` — React `cache()`-wrapped `getAuthUser()` / `getProfile()`
   (profile includes `org_role` + schools billing embed). All actions/layouts/RSC pages
   use them; middleware uses `auth.getClaims()` (local ES256 verify; project has
   asymmetric signing keys enabled — verified via JWKS endpoint).
3. Mutating actions revalidate every path that shows their data (`'/', 'layout'` where
   shell state changes); the ~15 client `router.refresh()` chasers were removed.

## Phase A — Verify preview, merge to main (needs Bjorn's OK to merge)

1. `git push -u origin perf/round-trip-reduction` → Vercel builds a preview.
   (Local `pnpm build` is impossible: `.env.local` has placeholders.)
2. If the preview build fails, fix on the branch. Watch for: `getClaims` typing against
   `@supabase/ssr` 0.12 / supabase-js 2.108; `React.cache` only exists in Next's bundled
   canary (the helper has an identity fallback for plain React 18).
3. Browser-check ON THE PREVIEW URL (Vercel preview env vars were set up previously —
   see memory `project_application_funnel_launch_state`):
   - Organizer login → lands on /dashboard (middleware `getClaims` path).
   - Navigate Aperçu → Candidatures → Formulaires (feel + no auth bounce).
   - One mutation without manual reload: toggle "Ouvrir les candidatures" on
     /applications, confirm UI updates from the action response alone.
   - Sign out → redirected to /login; gated route bounces to /login when logged out.
4. On Bjorn's explicit OK: merge `perf/round-trip-reduction` → `main` (no-ff), run the
   pre-push gate, push. Note: `vercel.json` region pin takes effect on this deploy.
5. Delete the branch; update memory `project_perf_round_trips.md` (mark merged).

## Phase B — RLS helper volatility migration (deferred audit finding, medium)

`my_role()` and `my_school_id()` (from `20260624000002_rls_policies.sql`) are VOLATILE,
so policies re-run their `users` subquery per scanned row. The later helpers in
`20260625000005_fix_rls_recursion.sql` are already `stable` — only these two lag.

Create `supabase/migrations/<ts>_stable_rls_helpers.sql`:

```sql
-- Volatile RLS helpers are re-evaluated per row; STABLE lets the planner
-- evaluate them once per statement. Bodies, grants and ownership unchanged.
alter function public.my_role() stable;
alter function public.my_school_id() stable;
```

Optionally (bigger, separate migration, only if advisors flag it): rewrite policies
using bare `auth.uid()` to `(select auth.uid())` for initplan caching — policies on
`users`, `exchange_enrollments`, `assignments`, plus the recursion-fix policies.
Run `mcp__supabase__get_advisors` (performance) after applying to confirm.

## Phase C — Missing FK index migration (deferred audit finding, medium)

Postgres does not index FK columns automatically; only the composite-unique leading
columns are covered today. Create `supabase/migrations/<ts>_fk_indexes.sql`:

```sql
-- FK/filter columns used by RLS policies and hot queries.
create index if not exists users_school_id_idx on users(school_id);
create index if not exists exchanges_school_a_idx on exchanges(school_a_id);
create index if not exists exchanges_school_b_idx on exchanges(school_b_id);
create index if not exists form_templates_exchange_idx on form_templates(exchange_id);
create index if not exists form_templates_school_idx on form_templates(school_id);
create index if not exists form_fields_template_idx on form_fields(template_id);
create index if not exists document_slots_template_idx on document_slots(template_id);
create index if not exists assignments_student_idx on assignments(student_id);
create index if not exists exchange_enrollments_user_idx on exchange_enrollments(user_id);
create index if not exists submissions_reviewer_idx on submissions(reviewer_id);
```

Apply B + C with `mcp__supabase__apply_migration` (NOT `supabase db push` — it hangs on
IPv6-less networks, see memory `reference_wsl2_supabase_db_push_ipv6`). Commit the
migration files to main (they're additive/safe; still run the gate).

## Phase D — optional, lowest value

- `actions/applications.ts` `listApplications`: replace `select('*')` with the columns
  the dashboard/candidatures actually consume (`id, status, submitted_at, data, email`,
  check ApplicationDetail for the rest before trimming).
- `actions/exchanges.ts` `getExchanges`: `select('*, …')` → explicit columns.

## Success criteria

- Phase A: preview verified in browser, merged + deployed with Bjorn's OK.
- Phases B/C: migrations applied via MCP + committed; `get_advisors` shows no new
  errors; app still passes 404/404 tests (RLS behavior unchanged, only planner hints).
