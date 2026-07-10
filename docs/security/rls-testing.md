# RLS regression testing

RLS is this app's primary tenant-isolation boundary (see the 2026-07-07
security-hardening spec). `pnpm test:rls` proves it: a vitest suite connects to
a **real Postgres with all migrations applied** and asserts the cross-tenant
matrix — acting as school B's organizer/student, every read of school A's rows
returns zero rows and every write is rejected, across all school-scoped tables
and all three storage buckets, plus positive own-school cases so the result is
not "deny all".

## Run it

    pnpm exec supabase start   # local stack (needs Docker; applies migrations)
    pnpm test:rls

- Fresh DB state after changing migrations: `pnpm exec supabase db reset`.
- No Docker (e.g. WSL without Docker Desktop integration)? Point the suite at a
  dedicated **test** project instead: `RLS_TEST_DB_URL=postgresql://… pnpm test:rls`.
  Never point it at production — the seed writes and deletes rows.
- CI runs the same suite on every PR and push to main (`.github/workflows/ci.yml`).

## Prove it detects regressions (fire drill / reviewer demo)

    node tests/rls/canary.mjs on    # adds an over-permissive policy
    pnpm test:rls                   # watch the exchange deny cases FAIL
    node tests/rls/canary.mjs off
    pnpm test:rls                   # green again

## Layout

- `tests/rls/db.ts` — connection + `runAs` impersonation (request.jwt.claims +
  `set local role`, always inside rolled-back transactions)
- `tests/rls/seed.ts` — committed two-school fixture world (superuser)
- `tests/rls/matrix.test.ts` — table matrix. Also pins the **partner boundary**:
  a shared (two-school) exchange — school A paired with a third school C, so
  school B stays unpaired and keeps guarding the "unrelated organizer can't read
  another school" case — where the partner organizer sees the exchange +
  enrollment rows but not the other school's user profiles or templates, and can
  only enroll their own school's students.
- `tests/rls/storage.test.ts` — storage.objects matrix (documents,
  application-photos, form-templates)
- The older one-shot SQL tests in `supabase/tests/*.test.sql` cover in-school
  *role* boundaries (student vs organizer) and still apply; this suite covers
  the cross-tenant matrix and runs in CI.

**Rule: any new table or storage bucket ships with matrix cases in the same PR.**
