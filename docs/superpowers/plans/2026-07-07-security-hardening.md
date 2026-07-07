# Security Hardening Roadmap (W1–W5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the five durable security controls from the 2026-07-07 hardening spec: an RLS regression test harness, a patched Next.js + standing dependency-audit cadence, a smaller service-role blast radius with a rotation runbook, an immutable audit trail for privileged actions, and fail-closed defense-in-depth on the anonymous flows.

**Architecture:** W1 adds a second vitest project (`pnpm test:rls`) that connects **directly to a real Postgres with the migrations applied** (Supabase local stack, or any DB via `RLS_TEST_DB_URL`) and asserts the cross-tenant deny/allow matrix by impersonating users with `set_config('request.jwt.claims', …)` + `set local role`, always inside rolled-back transactions. W2 upgrades to Next 15 / React 19 and adds GitHub Actions (this repo currently has **no CI at all**). W3 commits `.env.example` + a rotation runbook and migrates the reducible `createAdminClient()` call sites to the session client or narrow anon-granted `SECURITY DEFINER` RPCs. W4 adds an append-only `audit_log` table written only via the service role, instrumented into the nine privileged actions + the Stripe webhook. W5 adds a fail-closed rate-limit variant for the mail-sending keys and an app-level scope check on `listApplications`.

**Tech Stack:** Next.js (14→15), React (18→19), Supabase (Postgres + RLS + Storage), vitest 4, `postgres` (porsager) driver for the RLS suite, GitHub Actions, Supabase CLI 2.x local stack.

**Spec:** `docs/superpowers/specs/2026-07-07-security-hardening-design.md`

## Global Constraints

- Package manager is **pnpm** (local: pnpm 11.9.0, node v22). Never npm/npx for installs.
- Verification gate for every task: `pnpm lint` + `pnpm test` + `npx tsc --noEmit`. (`pnpm build` fails locally because `.env.local` holds placeholders — `tsc --noEmit` is the local substitute; Vercel builds `main`.)
- After Phase W1 exists, any task that touches `supabase/migrations/` or RLS also runs `pnpm test:rls`.
- Every migration task also updates `types/db.ts` in the same task (plan-gap rule from the 2026-07-07 email-controls project).
- New SQL functions are `security definer set search_path = public` with explicit `revoke … from public` and only the intended `grant execute` (mirrors `check_rate_limit`).
- **No student/parent PII in logs or audit rows** — row ids and action types only; never names, emails, notes, or submission contents.
- Prod migrations are applied via the Supabase MCP `apply_migration` tool at ship time — **never `supabase db push`** (known drift trap). During development they run against the local stack (`supabase db reset`).
- Work happens on branch `feature/security-hardening`. Merging to `main` (= production deploy) requires the full gate green **and Bjorn's confirmation**.
- All organizer-facing UI copy is French. Server-action error strings in the anonymous funnel are English today — keep new ones consistent with their file.

## Prerequisite (check before Phase W1, Task 1)

`docker` is **not currently available in this WSL2 distro**. The RLS suite needs one of:
1. **Docker Desktop WSL integration enabled** (Bjorn: Docker Desktop → Settings → Resources → WSL Integration → enable for this distro), then `pnpm exec supabase start` works, **or**
2. A **dedicated free-tier Supabase test project** (never prod!) with all migrations applied, its IPv4 session-pooler URL exported as `RLS_TEST_DB_URL`.

If neither is available when Task 1 starts: **STOP and ask Bjorn which to set up.** CI (GitHub Actions) has Docker and is unaffected.

## Execution notes

- Phases W1→W5 run in spec order. Each phase ends at a commit + green gate; per CLAUDE.md session hygiene, phase boundaries are `/clear` points — update the progress ledger (`.superpowers/sdd/progress.md`) and auto-memory before ending the session.
- Task 8 (auth-flow regression on a preview deploy) needs a browser/human — coordinate with Bjorn rather than skipping.

---

# Phase W1 — RLS regression test harness

**Files created in this phase:**
- `vitest.rls.config.ts` — second vitest project (node env, serial)
- `tests/rls/db.ts` — connection + impersonation helpers
- `tests/rls/smoke.test.ts` — DB reachable, migrations applied
- `tests/rls/seed.ts` — two-school fixture world (committed, superuser)
- `tests/rls/matrix.test.ts` — table deny/allow matrix
- `tests/rls/storage.test.ts` — storage.objects matrix (3 buckets)
- `tests/rls/canary.mjs` — regression fire-drill helper
- `.github/workflows/ci.yml` — unit + RLS jobs
- `docs/security/rls-testing.md` — reviewer-facing runbook
- Modified: `vitest.config.ts`, `package.json`, `CLAUDE.md`

### Task 1: Harness scaffolding + smoke test

**Files:**
- Create: `vitest.rls.config.ts`, `tests/rls/db.ts`, `tests/rls/smoke.test.ts`
- Modify: `vitest.config.ts`, `package.json`

**Interfaces:**
- Produces: `connect(): postgres.Sql`, `DB_URL: string`, `runAs<T>(sql, userId | null, fn): Promise<T>` (impersonated, always rolled back), `writeOutcome(sql, userId, write): Promise<'denied' | number>`, `expectBlocked(outcome): void` — all from `tests/rls/db.ts`. Script `pnpm test:rls`.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b feature/security-hardening
```

- [ ] **Step 2: Bootstrap the test database (prerequisite gate)**

```bash
docker info >/dev/null 2>&1 && echo DOCKER_OK || echo DOCKER_MISSING
```

If `DOCKER_MISSING` and no `RLS_TEST_DB_URL` is available: STOP, ask Bjorn (see Prerequisite above). Otherwise start the local stack (first run pulls images, takes minutes):

```bash
pnpm exec supabase start        # full stack: db + auth/storage schemas + applies migrations
```

If the stack was already running from earlier work, re-apply migrations cleanly with `pnpm exec supabase db reset`.
Expected: `supabase start` output ends with the local API/DB URLs; DB is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

- [ ] **Step 3: Add the Postgres driver**

```bash
pnpm add -D postgres
```

- [ ] **Step 4: Write the failing smoke test**

Create `tests/rls/db.ts`:

```ts
import postgres from 'postgres'

// Local Supabase stack by default. Override with RLS_TEST_DB_URL to point at a
// dedicated TEST project — never production: the seed writes and deletes rows.
export const DB_URL =
  process.env.RLS_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export function connect(): postgres.Sql {
  return postgres(DB_URL, { max: 1, onnotice: () => {} })
}

class Rollback extends Error {}

// Run `fn` impersonating an authenticated user (userId) or the anon role
// (userId = null) inside a transaction that ALWAYS rolls back, so no assertion
// can leak state into the database. Uses the same mechanism as the SQL tests in
// supabase/tests/: request.jwt.claims + `set local role`.
export async function runAs<T>(
  sql: postgres.Sql,
  userId: string | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let out!: T
  try {
    await sql.begin(async (tx) => {
      if (userId) {
        const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
        await tx`select set_config('request.jwt.claims', ${claims}, true)`
        await tx.unsafe('set local role authenticated')
      } else {
        await tx.unsafe('set local role anon')
      }
      out = await fn(tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  return out
}

// Outcome of a write attempt under RLS: 'denied' (a raised error) or the number
// of rows affected. A blocked UPDATE/DELETE surfaces as 0 rows; a blocked
// INSERT raises 42501. Guard triggers (e.g. guard_submission_review,
// validate_enrollment_user) raise check_violation 23514 — equally a denial.
export async function writeOutcome(
  sql: postgres.Sql,
  userId: string | null,
  write: (tx: postgres.TransactionSql) => Promise<{ count: number }>,
): Promise<'denied' | number> {
  try {
    const res = await runAs(sql, userId, write)
    return res.count
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === '42501' || code === '23514') return 'denied'
    throw e
  }
}

export function expectBlocked(outcome: 'denied' | number): void {
  if (outcome !== 'denied' && outcome !== 0) {
    throw new Error(`expected the write to be blocked, but it affected ${outcome} row(s)`)
  }
}
```

Create `tests/rls/smoke.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { connect, DB_URL } from './db'

const sql = connect()
afterAll(() => sql.end())

describe('rls harness smoke', () => {
  it('refuses to target a remote DB unless explicitly overridden', () => {
    // The seed writes and deletes rows — never point it at prod by accident.
    if (!process.env.RLS_TEST_DB_URL) expect(DB_URL).toContain('127.0.0.1')
  })

  it('reaches the test database', async () => {
    const [{ one }] = await sql`select 1 as one`
    expect(one).toBe(1)
  })

  it('has the migrations applied (policies + buckets present)', async () => {
    const [{ n }] = await sql`
      select count(*)::int as n from pg_policies where schemaname in ('public', 'storage')`
    expect(n).toBeGreaterThan(20)
    const buckets = await sql`select id from storage.buckets order by id`
    expect(buckets.map((b) => b.id)).toEqual(['application-photos', 'documents', 'form-templates'])
  })
})
```

Create `vitest.rls.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

// Second vitest project: RLS integration tests against a real Postgres with the
// migrations applied (see docs/security/rls-testing.md). Serial — the files
// share one database.
export default defineConfig({
  test: {
    include: ['tests/rls/**/*.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Modify `vitest.config.ts` — keep the main (jsdom) project from picking up the RLS files:

```ts
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/rls/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Modify `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:rls": "vitest run --config vitest.rls.config.ts"
```

- [ ] **Step 5: Run the smoke test — verify it passes against the live stack**

Run: `pnpm test:rls`
Expected: 3 passed. (If it fails with `ECONNREFUSED`, the stack isn't running — back to Step 2.)

- [ ] **Step 6: Verify the main suite is untouched**

Run: `pnpm test`
Expected: same count as on `main` (555 passing as of the feedback-widget merge), zero `tests/rls` files collected.

- [ ] **Step 7: Gate + commit**

```bash
pnpm lint && npx tsc --noEmit
git add vitest.rls.config.ts vitest.config.ts package.json pnpm-lock.yaml tests/rls/db.ts tests/rls/smoke.test.ts
git commit -m "test(rls): harness scaffolding — second vitest project against real Postgres"
```

### Task 2: Fixture world (two schools, committed superuser seed)

**Files:**
- Create: `tests/rls/seed.ts`, `tests/rls/seed.test.ts`

**Interfaces:**
- Consumes: `connect()` from `tests/rls/db.ts` (Task 1)
- Produces: `seedFixtures(sql): Promise<Fixtures>`, `cleanupFixtures(sql, fx): Promise<void>`, `type Fixtures` with ids: `schoolA/schoolB`, `orgA/orgB/studentA/studentB`, `exchangeA`, `applySlugA`, `templateA`, `fieldA/fieldA2`, `slotA/slotA2`, `assignmentA`, `submissionA`, `answerA`, `applicationA`, `resumeTokenA`, `feedbackA`, `docPathA/photoPathA/tplPathA`, `suffix`

**Seeding gotchas this code already accounts for (do not "simplify" them away):**
- The enrollment is inserted **before** the active template so `trg_assign_on_template_insert` auto-creates the assignment (there is no direct assignments insert).
- The submission is seeded `status='submitted'` with **null review fields** — `guard_submission_review` raises for review outcomes even as the postgres role (its `my_role()` is null without a JWT).
- `fieldA2`/`slotA2` exist **without** an answer/upload so deny-INSERT tests can't trip the `(submission_id, field_id)` / `(submission_id, slot_id)` unique constraints (which would surface 23505 instead of the RLS 42501).

- [ ] **Step 1: Write the failing seed test**

Create `tests/rls/seed.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { connect } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
afterAll(() => sql.end())

describe('fixture seed', () => {
  it('creates the full school-A world and tears it down cleanly', async () => {
    let fx: Fixtures | undefined
    try {
      fx = await seedFixtures(sql)
      // Auto-assign trigger produced the assignment.
      expect(fx.assignmentA).toMatch(/^[0-9a-f-]{36}$/)
      const [sub] = await sql`select status from submissions where id = ${fx.submissionA}`
      expect(sub.status).toBe('submitted')
      const objects = await sql`
        select bucket_id from storage.objects
        where name in (${fx.docPathA}, ${fx.photoPathA}, ${fx.tplPathA}) order by bucket_id`
      expect(objects.map((o) => o.bucket_id)).toEqual(['application-photos', 'documents', 'form-templates'])
    } finally {
      if (fx) await cleanupFixtures(sql, fx)
    }
    const rows = await sql`select id from schools where name like ${'RLS École %' + fx!.suffix}`
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:rls -- seed`
Expected: FAIL — `Cannot find module './seed'`.

- [ ] **Step 3: Implement the seed module**

Create `tests/rls/seed.ts`:

```ts
import type postgres from 'postgres'
import { randomUUID, randomBytes } from 'node:crypto'

export type Fixtures = {
  suffix: string
  schoolA: string; schoolB: string
  orgA: string; orgB: string; studentA: string; studentB: string
  exchangeA: string; applySlugA: string
  templateA: string; fieldA: string; fieldA2: string; slotA: string; slotA2: string
  assignmentA: string; submissionA: string; answerA: string
  applicationA: string; resumeTokenA: string; feedbackA: string
  docPathA: string; photoPathA: string; tplPathA: string
}

// Seed a complete "school A" world plus a second school B with an organizer and
// a student, committed as the postgres superuser (bypasses RLS; triggers still
// run). Matrix tests act as school-B personas against school-A rows.
export async function seedFixtures(sql: postgres.Sql): Promise<Fixtures> {
  const suffix = randomBytes(4).toString('hex')
  const id = () => randomUUID()
  const fx: Fixtures = {
    suffix,
    schoolA: id(), schoolB: id(),
    orgA: id(), orgB: id(), studentA: id(), studentB: id(),
    exchangeA: id(), applySlugA: `rls-matrix-${suffix}`,
    templateA: id(), fieldA: id(), fieldA2: id(), slotA: id(), slotA2: id(),
    assignmentA: '', submissionA: id(), answerA: id(),
    applicationA: id(), resumeTokenA: `rls-resume-${suffix}`, feedbackA: id(),
    docPathA: '', photoPathA: '', tplPathA: '',
  }

  await sql`insert into schools (id, name) values
    (${fx.schoolA}, ${'RLS École A ' + suffix}), (${fx.schoolB}, ${'RLS École B ' + suffix})`

  const authRows = [fx.orgA, fx.orgB, fx.studentA, fx.studentB].map((uid) => ({
    id: uid,
    instance_id: '00000000-0000-0000-0000-000000000000',
    aud: 'authenticated',
    role: 'authenticated',
    email: `${uid}@rls.test`,
  }))
  await sql`insert into auth.users ${sql(authRows)}`

  await sql`insert into users ${sql([
    { id: fx.orgA, school_id: fx.schoolA, role: 'organizer', org_role: 'owner', full_name: 'Org A', email: `${fx.orgA}@rls.test` },
    { id: fx.orgB, school_id: fx.schoolB, role: 'organizer', org_role: 'owner', full_name: 'Org B', email: `${fx.orgB}@rls.test` },
    { id: fx.studentA, school_id: fx.schoolA, role: 'student', org_role: 'admin', full_name: 'Étudiant A', email: `${fx.studentA}@rls.test` },
    { id: fx.studentB, school_id: fx.schoolB, role: 'student', org_role: 'admin', full_name: 'Étudiant B', email: `${fx.studentB}@rls.test` },
  ])}`

  await sql`insert into exchanges (id, name, year, school_a_id, school_b_id, apply_slug, application_open)
    values (${fx.exchangeA}, ${'RLS Échange A ' + suffix}, 2026, ${fx.schoolA}, null, ${fx.applySlugA}, true)`

  // Enrollment BEFORE the template: the active-template trigger then creates the assignment.
  await sql`insert into exchange_enrollments (exchange_id, user_id)
    values (${fx.exchangeA}, ${fx.studentA})`

  await sql`insert into form_templates
      (id, exchange_id, school_id, name, description, type, kind, status, audience, deadline, created_by)
    values (${fx.templateA}, ${fx.exchangeA}, ${fx.schoolA}, ${'Fiche RLS ' + suffix}, null,
      'data_entry', 'online', 'active', 'all', current_date + 30, ${fx.orgA})`

  await sql`insert into form_fields (id, template_id, label, field_type, required, "order") values
    (${fx.fieldA},  ${fx.templateA}, 'Réponse', 'text', true, 0),
    (${fx.fieldA2}, ${fx.templateA}, 'Réponse 2 (jamais répondue)', 'text', false, 1)`
  await sql`insert into document_slots (id, template_id, label, description, required, "order") values
    (${fx.slotA},  ${fx.templateA}, 'Passeport', null, true, 0),
    (${fx.slotA2}, ${fx.templateA}, 'Visa (jamais déposé)', null, false, 1)`

  const [assignment] = await sql`
    select id from assignments where template_id = ${fx.templateA} and student_id = ${fx.studentA}`
  if (!assignment) throw new Error('seed failed: auto-assign trigger did not create the assignment')
  fx.assignmentA = assignment.id as string

  // 'submitted' with null review fields — guard_submission_review rejects
  // seeding review outcomes as the postgres role (my_role() is null).
  await sql`insert into submissions (id, assignment_id, status, submitted_at)
    values (${fx.submissionA}, ${fx.assignmentA}, 'submitted', now())`
  await sql`insert into field_answers (id, submission_id, field_id, value)
    values (${fx.answerA}, ${fx.submissionA}, ${fx.fieldA}, 'quarante-deux')`

  fx.docPathA = `${fx.assignmentA}/${fx.slotA}/passeport.pdf`
  await sql`insert into document_uploads (submission_id, slot_id, storage_path, file_name)
    values (${fx.submissionA}, ${fx.slotA}, ${fx.docPathA}, 'passeport.pdf')`

  await sql`insert into applications (id, exchange_id, school_id, email, resume_token, status, data, submitted_at)
    values (${fx.applicationA}, ${fx.exchangeA}, ${fx.schoolA}, ${'applicant-' + suffix + '@rls.test'},
      ${fx.resumeTokenA}, 'submitted', ${sql.json({ first_name: 'Testine', last_name: 'Fixture' })}, now())`

  await sql`insert into feedback (id, user_id, school_id, type, message)
    values (${fx.feedbackA}, ${fx.orgA}, ${fx.schoolA}, 'suggestion', 'ligne de test RLS')`

  fx.photoPathA = `${fx.applicationA}/photo.jpg`
  fx.tplPathA = `${fx.schoolA}/${fx.templateA}.pdf`
  await sql`insert into storage.objects (bucket_id, name) values
    ('documents', ${fx.docPathA}),
    ('application-photos', ${fx.photoPathA}),
    ('form-templates', ${fx.tplPathA})`

  return fx
}

export async function cleanupFixtures(sql: postgres.Sql, fx: Fixtures): Promise<void> {
  await sql`delete from storage.objects where name in (${fx.docPathA}, ${fx.photoPathA}, ${fx.tplPathA})`
  // exchange delete cascades templates → fields/slots/assignments → submissions
  // → answers/uploads, plus applications and enrollments.
  await sql`delete from exchanges where id = ${fx.exchangeA}`
  // auth.users delete cascades the public.users profiles and feedback.
  await sql`delete from auth.users where id in (${fx.orgA}, ${fx.orgB}, ${fx.studentA}, ${fx.studentB})`
  await sql`delete from schools where id in (${fx.schoolA}, ${fx.schoolB})`
}
```

- [ ] **Step 4: Run the seed test — verify it passes**

Run: `pnpm test:rls -- seed`
Expected: PASS. If a cascade delete fails with a foreign-key error, inspect the offending FK (`\d+ <table>` via `sql` or read the migration) and add an explicit `delete from <child> …` line before the failing delete in `cleanupFixtures` — do not weaken the assertion that everything is gone.

- [ ] **Step 5: Gate + commit**

```bash
pnpm lint && npx tsc --noEmit && pnpm test
git add tests/rls/seed.ts tests/rls/seed.test.ts
git commit -m "test(rls): two-school fixture world with committed superuser seed"
```

### Task 3: Cross-tenant matrix — core tables

**Files:**
- Create: `tests/rls/matrix.test.ts`

**Interfaces:**
- Consumes: `connect`, `runAs`, `writeOutcome`, `expectBlocked` (Task 1); `seedFixtures`, `cleanupFixtures`, `Fixtures` (Task 2)
- Produces: the file this task creates is extended in Task 4 (child tables) — keep the `describe.each` persona structure below.

- [ ] **Step 1: Write the matrix tests (core tables)**

Create `tests/rls/matrix.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => {
  fx = await seedFixtures(sql)
})
afterAll(async () => {
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

// Read as a persona; a revoked-grant error counts as "no rows visible".
async function readRows(
  userId: string | null,
  q: (tx: postgres.TransactionSql) => Promise<postgres.Row[]>,
): Promise<postgres.Row[]> {
  try {
    return await runAs(sql, userId, q)
  } catch (e) {
    if ((e as { code?: string }).code === '42501') return []
    throw e
  }
}

// ---------------------------------------------------------------------------
// DENY: school-B personas must see and touch NOTHING of school A.
// ---------------------------------------------------------------------------
describe.each([
  ['organizer B', 'orgB'],
  ['student B', 'studentB'],
] as const)('cross-tenant deny as %s', (_label, personaKey) => {
  const uid = () => fx[personaKey]

  it('schools: cannot read school A', async () => {
    expect(await readRows(uid(), (tx) => tx`select id from schools where id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('schools: cannot rename school A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update schools set name = 'pwned' where id = ${fx.schoolA}`))
  })

  it('users: cannot read school A profiles', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from users where id in (${fx.orgA}, ${fx.studentA})`)).toHaveLength(0)
  })

  it('users: cannot update a school A profile', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update users set full_name = 'pwned' where id = ${fx.studentA}`))
  })

  it('exchanges: cannot read exchange A', async () => {
    expect(await readRows(uid(), (tx) => tx`select id from exchanges where id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchanges: cannot update exchange A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update exchanges set name = 'pwned' where id = ${fx.exchangeA}`))
  })

  it('exchange_enrollments: cannot read exchange A enrollments', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from exchange_enrollments where exchange_id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchange_enrollments: cannot enroll into exchange A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into exchange_enrollments (exchange_id, user_id) values (${fx.exchangeA}, ${uid()})`))
  })

  it('form_templates: cannot read template A', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from form_templates where id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('form_templates: cannot update template A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update form_templates set name = 'pwned' where id = ${fx.templateA}`))
  })

  it('form_templates: cannot create a template inside school A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into form_templates (exchange_id, school_id, name, type, kind, status, audience, deadline, created_by)
         values (${fx.exchangeA}, ${fx.schoolA}, 'pwned', 'data_entry', 'online', 'active', 'all', current_date + 7, ${uid()})`))
  })

  it('form_fields: cannot read school A fields', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from form_fields where template_id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('form_fields: cannot insert into template A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into form_fields (template_id, label, field_type, required, "order")
         values (${fx.templateA}, 'pwned', 'text', true, 9)`))
  })

  it('form_fields: cannot delete a school A field', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`delete from form_fields where id = ${fx.fieldA}`))
  })

  it('document_slots: cannot read school A slots', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from document_slots where template_id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('document_slots: cannot insert into template A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into document_slots (template_id, label, description, required, "order")
         values (${fx.templateA}, 'pwned', null, true, 9)`))
  })

  it('assignments: cannot read school A assignments', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from assignments where id = ${fx.assignmentA}`)).toHaveLength(0)
  })

  it('assignments: cannot update a school A assignment', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update assignments set assigned_at = now() where id = ${fx.assignmentA}`))
  })
})

// ---------------------------------------------------------------------------
// ALLOW: own-school access works (the policies are not simply "deny all").
// ---------------------------------------------------------------------------
describe('own-school allow', () => {
  it('organizer A reads their school, exchange, template, field, slot and enrollment', async () => {
    const rows = await runAs(sql, fx.orgA, async (tx) => ({
      school: await tx`select id from schools where id = ${fx.schoolA}`,
      exchange: await tx`select id from exchanges where id = ${fx.exchangeA}`,
      template: await tx`select id from form_templates where id = ${fx.templateA}`,
      field: await tx`select id from form_fields where id = ${fx.fieldA}`,
      slot: await tx`select id from document_slots where id = ${fx.slotA}`,
      enrollment: await tx`select id from exchange_enrollments where exchange_id = ${fx.exchangeA}`,
      student: await tx`select id from users where id = ${fx.studentA}`,
    }))
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `organizer A should see their own ${name}`).toHaveLength(1)
    }
  })

  it('organizer A can update their own exchange', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update exchanges set name = name where id = ${fx.exchangeA}`)).toBe(1)
  })

  it('student A reads their own profile, assignment and template', async () => {
    const rows = await runAs(sql, fx.studentA, async (tx) => ({
      me: await tx`select id from users where id = ${fx.studentA}`,
      assignment: await tx`select id from assignments where id = ${fx.assignmentA}`,
      template: await tx`select id from form_templates where id = ${fx.templateA}`,
      enrollment: await tx`select id from exchange_enrollments where user_id = ${fx.studentA}`,
    }))
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `student A should see their own ${name}`).toHaveLength(1)
    }
  })

  it('student B still reads their own profile (B personas are not deny-all)', async () => {
    expect(await runAs(sql, fx.studentB, (tx) =>
      tx`select id from users where id = ${fx.studentB}`)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the matrix**

Run: `pnpm test:rls -- matrix`
Expected: ALL PASS. A failing deny case here is a real cross-tenant leak — stop and investigate the policy before touching the test (systematic-debugging), and flag it to Bjorn in the task report.

- [ ] **Step 3: Gate + commit**

```bash
pnpm lint && npx tsc --noEmit
git add tests/rls/matrix.test.ts
git commit -m "test(rls): cross-tenant deny/allow matrix — core school-scoped tables"
```

### Task 4: Cross-tenant matrix — child tables, applications, feedback, anon

**Files:**
- Modify: `tests/rls/matrix.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3; extends the same `describe.each` deny block and adds a new anon block.

- [ ] **Step 1: Extend the deny block**

Append inside the existing `describe.each(…)('cross-tenant deny as %s', …)` callback (after the assignments cases):

```ts
  it('submissions: cannot read submission A', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from submissions where id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('submissions: cannot touch submission A review fields', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update submissions set review_note = 'pwned' where id = ${fx.submissionA}`))
  })

  it('field_answers: cannot read answer A', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from field_answers where id = ${fx.answerA}`)).toHaveLength(0)
  })

  it('field_answers: cannot insert an answer into submission A', async () => {
    // fieldA2 has no stored answer, so a pass-through would hit RLS, not the
    // (submission_id, field_id) unique constraint.
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into field_answers (submission_id, field_id, value)
         values (${fx.submissionA}, ${fx.fieldA2}, 'pwned')`))
  })

  it('field_answers: cannot update answer A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update field_answers set value = 'pwned' where id = ${fx.answerA}`))
  })

  it('document_uploads: cannot read school A uploads', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from document_uploads where submission_id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('document_uploads: cannot insert an upload into submission A', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into document_uploads (submission_id, slot_id, storage_path, file_name)
         values (${fx.submissionA}, ${fx.slotA2}, ${fx.assignmentA + '/' + fx.slotA2 + '/pwned.pdf'}, 'pwned.pdf')`))
  })

  it('applications: cannot read school A applications', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from applications where id = ${fx.applicationA}`)).toHaveLength(0)
  })

  it('applications: cannot read by resume token either', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from applications where resume_token = ${fx.resumeTokenA}`)).toHaveLength(0)
  })

  it('applications: cannot update school A applications', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`update applications set status = 'accepted' where id = ${fx.applicationA}`))
  })

  it('feedback: cannot read any feedback (no client SELECT policy)', async () => {
    expect(await readRows(uid(), (tx) =>
      tx`select id from feedback where id = ${fx.feedbackA}`)).toHaveLength(0)
  })

  it('feedback: cannot forge feedback as another user', async () => {
    expectBlocked(await writeOutcome(sql, uid(), (tx) =>
      tx`insert into feedback (user_id, school_id, type, message)
         values (${fx.orgA}, ${fx.schoolA}, 'bug', 'forged')`))
  })
```

- [ ] **Step 2: Extend the allow block and add the anon block**

Append inside `describe('own-school allow', …)`:

```ts
  it('organizer A reads the submission, answer, upload and application', async () => {
    const rows = await runAs(sql, fx.orgA, async (tx) => ({
      submission: await tx`select id from submissions where id = ${fx.submissionA}`,
      answer: await tx`select id from field_answers where id = ${fx.answerA}`,
      upload: await tx`select id from document_uploads where submission_id = ${fx.submissionA}`,
      application: await tx`select id from applications where id = ${fx.applicationA}`,
    }))
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `organizer A should see their own ${name}`).toHaveLength(1)
    }
  })

  it('organizer A can approve the submission (review guard allows in-school organizer)', async () => {
    expect(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update submissions set status = 'approved', reviewer_id = ${fx.orgA}, reviewed_at = now()
         where id = ${fx.submissionA}`)).toBe(1)
  })

  it('student A can update their own answer', async () => {
    expect(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`update field_answers set value = 'quarante-trois' where id = ${fx.answerA}`)).toBe(1)
  })

  it('any authenticated user can insert feedback stamped with their own uid', async () => {
    expect(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into feedback (user_id, school_id, type, message)
         values (${fx.orgB}, ${fx.schoolB}, 'suggestion', 'own row')`)).toBe(1)
  })
```

Append as a new top-level block at the end of the file:

```ts
// ---------------------------------------------------------------------------
// ANON: the anonymous role sees nothing — the token flows go through the
// service role (or, after W3, narrow SECURITY DEFINER RPCs), never table reads.
// ---------------------------------------------------------------------------
describe('anon sees nothing', () => {
  it('cannot read exchanges, applications, submissions or storage objects', async () => {
    const rows = {
      exchange: await readRows(null, (tx) => tx`select id from exchanges where id = ${fx.exchangeA}`),
      applicationByToken: await readRows(null, (tx) =>
        tx`select id from applications where resume_token = ${fx.resumeTokenA}`),
      submission: await readRows(null, (tx) => tx`select id from submissions where id = ${fx.submissionA}`),
      storage: await readRows(null, (tx) => tx`select id from storage.objects where name = ${fx.docPathA}`),
    }
    for (const [name, r] of Object.entries(rows)) {
      expect(r, `anon must not see ${name}`).toHaveLength(0)
    }
  })
})
```

- [ ] **Step 3: Run the full matrix**

Run: `pnpm test:rls`
Expected: ALL PASS (smoke + seed + matrix). Same rule as Task 3: a failing deny case is a finding, not a test bug.

- [ ] **Step 4: Gate + commit**

```bash
pnpm lint && npx tsc --noEmit
git add tests/rls/matrix.test.ts
git commit -m "test(rls): matrix part 2 — submissions children, applications, feedback, anon"
```

### Task 5: Storage matrix (all three buckets)

**Files:**
- Create: `tests/rls/storage.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 helpers/seed. Object path conventions (from the storage migrations): documents = `<assignment_id>/<slot_id>/<file>`, application-photos = `<application_id>/<file>`, form-templates = `<school_id>/<template_id>.pdf`.

- [ ] **Step 1: Write the storage tests**

Create `tests/rls/storage.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => {
  fx = await seedFixtures(sql)
})
afterAll(async () => {
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

async function visible(userId: string | null, name: string): Promise<boolean> {
  try {
    const rows = await runAs(sql, userId, (tx) =>
      tx`select id from storage.objects where name = ${name}`)
    return rows.length === 1
  } catch (e) {
    if ((e as { code?: string }).code === '42501') return false
    throw e
  }
}

describe('storage.objects — documents bucket', () => {
  it('owning student and school A organizer see the file; school B personas do not', async () => {
    expect(await visible(fx.studentA, fx.docPathA)).toBe(true)
    expect(await visible(fx.orgA, fx.docPathA)).toBe(true)
    expect(await visible(fx.orgB, fx.docPathA)).toBe(false)
    expect(await visible(fx.studentB, fx.docPathA)).toBe(false)
  })

  it('school B student cannot plant a file under school A assignment prefix', async () => {
    expectBlocked(await writeOutcome(sql, fx.studentB, (tx) =>
      tx`insert into storage.objects (bucket_id, name)
         values ('documents', ${fx.assignmentA + '/' + fx.slotA2 + '/pwned.pdf'})`))
  })

  it('owning student CAN write under their own assignment prefix', async () => {
    expect(await writeOutcome(sql, fx.studentA, (tx) =>
      tx`insert into storage.objects (bucket_id, name)
         values ('documents', ${fx.assignmentA + '/' + fx.slotA2 + '/nouveau.pdf'})`)).toBe(1)
  })
})

describe('storage.objects — application-photos bucket', () => {
  it('is service-role only: no client persona sees the photo', async () => {
    for (const uid of [fx.orgA, fx.orgB, fx.studentA, fx.studentB, null]) {
      expect(await visible(uid, fx.photoPathA), `persona ${uid ?? 'anon'}`).toBe(false)
    }
  })
})

describe('storage.objects — form-templates bucket', () => {
  it('school A organizer and assigned student see the PDF; school B personas do not', async () => {
    expect(await visible(fx.orgA, fx.tplPathA)).toBe(true)
    expect(await visible(fx.studentA, fx.tplPathA)).toBe(true)
    expect(await visible(fx.orgB, fx.tplPathA)).toBe(false)
    expect(await visible(fx.studentB, fx.tplPathA)).toBe(false)
  })

  it('school B organizer cannot plant a file under school A prefix', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgB, (tx) =>
      tx`insert into storage.objects (bucket_id, name)
         values ('form-templates', ${fx.schoolA + '/pwned.pdf'})`))
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm test:rls -- storage`
Expected: ALL PASS.

- [ ] **Step 3: Gate + commit**

```bash
pnpm lint && npx tsc --noEmit
git add tests/rls/storage.test.ts
git commit -m "test(rls): storage.objects matrix for all three buckets"
```

### Task 6: Canary fire-drill, CI workflow, reviewer docs

**Files:**
- Create: `tests/rls/canary.mjs`, `.github/workflows/ci.yml`, `docs/security/rls-testing.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create the canary helper**

Create `tests/rls/canary.mjs`:

```js
// Usage: node tests/rls/canary.mjs on|off
// Deliberately adds (or removes) an over-permissive SELECT policy on exchanges
// so you can watch `pnpm test:rls` FAIL — live proof the harness detects an RLS
// regression. Always run `off` afterwards (or `supabase db reset`).
import postgres from 'postgres'

const sql = postgres(
  process.env.RLS_TEST_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  { max: 1 },
)
const mode = process.argv[2]
if (mode === 'on') {
  await sql.unsafe(`create policy rls_canary on exchanges for select using (true)`)
} else if (mode === 'off') {
  await sql.unsafe(`drop policy if exists rls_canary on exchanges`)
} else {
  console.error('usage: node tests/rls/canary.mjs on|off')
  process.exit(1)
}
console.log(`canary ${mode}`)
await sql.end()
```

- [ ] **Step 2: Run the fire drill — prove the harness can fail**

```bash
node tests/rls/canary.mjs on
pnpm test:rls          # EXPECTED: FAILURES — "exchanges: cannot read exchange A" for both B personas
node tests/rls/canary.mjs off
pnpm test:rls          # EXPECTED: all green again
```

If the suite stays green with the canary on, the harness is broken — stop and debug before proceeding.

- [ ] **Step 3: Add CI (first workflow in this repo)**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm exec tsc --noEmit
      - run: pnpm test

  rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase start   # applies supabase/migrations to the local stack
      - run: pnpm test:rls
```

- [ ] **Step 4: Write the reviewer runbook**

Create `docs/security/rls-testing.md`:

```markdown
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
- `tests/rls/matrix.test.ts` — table matrix
- `tests/rls/storage.test.ts` — storage.objects matrix (documents,
  application-photos, form-templates)
- The older one-shot SQL tests in `supabase/tests/*.test.sql` cover in-school
  *role* boundaries (student vs organizer) and still apply; this suite covers
  the cross-tenant matrix and runs in CI.

**Rule: any new table or storage bucket ships with matrix cases in the same PR.**
```

- [ ] **Step 5: Add the CLAUDE.md hook**

In `CLAUDE.md`, in the "Verifying Changes" section, after the `pnpm build` line inside the code fence, no change; instead append this paragraph right after the code fence:

```markdown
Any change touching `supabase/migrations/`, RLS policies, or storage buckets must
also pass `pnpm test:rls` (RLS regression matrix — see `docs/security/rls-testing.md`;
needs the local Supabase stack or `RLS_TEST_DB_URL`). New tables/buckets ship with
matrix cases in the same PR.
```

- [ ] **Step 6: Gate + commit + push (workflows only run once pushed)**

```bash
pnpm lint && npx tsc --noEmit && pnpm test && pnpm test:rls
git add tests/rls/canary.mjs .github/workflows/ci.yml docs/security/rls-testing.md CLAUDE.md
git commit -m "ci: RLS matrix + unit jobs; canary fire-drill; reviewer runbook"
git push -u origin feature/security-hardening
```

Then check the Actions run: `gh run list --branch feature/security-hardening` and `gh run watch` until both jobs pass. If the `rls` job fails on `supabase start` (service flakiness), retry once; if it fails deterministically, read the log — the most likely cause is a migration that assumes prod-only state, which must be fixed in a follow-up migration, not by skipping the job.

**PHASE W1 BOUNDARY — commit, update `.superpowers/sdd/progress.md` + auto-memory, tell Bjorn this is a `/clear` point. Resume prompt: « resume Phase W2 of docs/superpowers/plans/2026-07-07-security-hardening.md »**

---

# Phase W2 — Next.js upgrade + dependency cadence

### Task 7: Upgrade Next 14.2.35 → 15.x (+ React 19)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `app/billing/page.tsx`

**Why 15.x (decision recorded):** the middleware/proxy-bypass advisory and 4 other high advisories are unpatched on the 14.x line — there is no safe 14.2.x to move to. Next 15 App Router requires React 19. The codebase is already 15-shaped: every dynamic page types `params` as `Promise<…>` and awaits it, and all `cookies()`/`headers()` calls are already awaited. The only known sync straggler is `searchParams` in `app/billing/page.tsx`.

- [ ] **Step 1: Record the baseline (evidence for the review)**

```bash
pnpm audit --prod --audit-level high; echo "exit=$?"
```

Expected: non-zero exit, ~5 high advisories against `next`. Paste the summary into the task report/commit body.

- [ ] **Step 2: Bump the packages**

```bash
pnpm add next@15 react@19 react-dom@19
pnpm add -D eslint-config-next@15 @types/react@19 @types/react-dom@19
```

Peer-dependency warnings from `lucide-react`/Radix are expected and non-blocking; only act if Step 5's tests actually fail (then `pnpm add lucide-react@latest` and re-run).

- [ ] **Step 3: Fix the one known async-API straggler**

In `app/billing/page.tsx` replace:

```tsx
export default async function BillingPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const unavailable = searchParams?.error === 'unavailable'
```

with:

```tsx
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const unavailable = error === 'unavailable'
```

- [ ] **Step 4: Type-check and fix what tsc surfaces**

Run: `npx tsc --noEmit`
Known React-19-types fixes if they appear (apply mechanically):
- `useRef<T>()` now requires an argument → `useRef<T>(undefined)` (or `null` where the code null-checks).
- `JSX.Element` namespace moves → import `type { JSX } from 'react'` or use `React.JSX.Element`.
Fix every error; re-run until clean.

- [ ] **Step 5: Run the full gate**

```bash
pnpm lint && pnpm test && pnpm test:rls
```

Expected: all green. (`next lint` prints a deprecation notice under Next 15 — fine, ignore; do not migrate the lint setup in this task.)

- [ ] **Step 6: Verify the advisories are cleared**

```bash
pnpm audit --prod --audit-level high; echo "exit=$?"
```

Expected: `exit=0`, no high/critical advisories.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml app/billing/page.tsx   # plus any files fixed in Step 4 — stage them BY NAME, never -A
git commit -m "chore: upgrade next 14.2.35 -> 15.x, react 18 -> 19 (clears 5 high advisories incl. middleware bypass)"
```

### Task 8: Regression-verify the fragile auth flows (needs human/browser)

The spec flags these as the parts most likely to break across the major bump: `/auth/confirm` and `/auth/callback` cookie-flush-via-`redirect()`, `middleware.ts` gating, and server-action cookie writes.

- [ ] **Step 1: Confirm the automated coverage is green** — `app/__tests__/middleware.test.ts`, `confirm.test.ts`, `callback.test.ts` all passed in Task 7 Step 5.

- [ ] **Step 2: Push and get the preview deploy**

```bash
git push
```

Get the preview URL from the Vercel MCP (`list_deployments` for this branch, state READY) — per the preview-deploy workflow memory, previews share PROD data; use the existing test organizer account, do not create student PII.

- [ ] **Step 3: Walk the checklist with Bjorn (or chrome-devtools MCP)** — STOP and coordinate; do not skip:

1. `/login` with the test organizer → lands on `/dashboard` (middleware + session cookie).
2. Visit `/login` again while signed in → redirected to `/dashboard` (middleware role redirect).
3. Sign out → visiting `/dashboard` bounces to `/login` (gate).
4. "Continuer avec Google" → completes → `/dashboard` (`/auth/callback` PKCE + cookie persist via `redirect()`).
5. Create a throwaway exchange (createExchange server action) → shell switches to it (server-action cookie write) → delete/archive it after.
6. Password-reset or signup-confirm email link → `/auth/confirm` → session established (email OTP path).

Record pass/fail per item in the task report. Any failure: fix on the branch before proceeding (systematic-debugging), re-run the checklist item.

### Task 9: Standing dependency-audit cadence

**Files:**
- Create: `.github/workflows/dependency-audit.yml`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create the workflow**

```yaml
name: Dependency audit
on:
  schedule:
    - cron: '0 6 * * 1'   # Mondays 06:00 UTC
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - run: pnpm audit --prod --audit-level high
```

- [ ] **Step 2: Document the triage rule in CLAUDE.md**

Append a new section after "Verifying Changes":

```markdown
## Dependency Audit Cadence

`.github/workflows/dependency-audit.yml` runs `pnpm audit --prod --audit-level high`
weekly (Monday 06:00 UTC) and on every push to `main`; it fails on any high/critical
advisory in production dependencies. Triage rule when it goes red: bump to the patched
release within the week (patch/minor bump → straight to `main` after the Verifying
Changes commands; major bump → branch + full gate + auth-flow regression). If no patch
exists, record the advisory and the accepted-risk rationale in
`docs/security/audit-decisions.md` and re-check weekly.
```

- [ ] **Step 3: Gate + commit + verify the workflow runs**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add .github/workflows/dependency-audit.yml CLAUDE.md
git commit -m "ci: weekly prod dependency audit failing on high/critical + triage rule"
git push
gh workflow run dependency-audit.yml --ref feature/security-hardening 2>/dev/null || true
gh run list --workflow dependency-audit.yml
```

(`workflow_dispatch` on a non-default branch may be refused until merged — that's fine; it runs on push to main after the merge. Confirm then.)

**PHASE W2 BOUNDARY — `/clear` point. Resume prompt: « resume Phase W3 of docs/superpowers/plans/2026-07-07-security-hardening.md »**

---
# Phase W3 — Service-role blast radius + rotation runbook

### Task 10: `.env.example`

**Files:**
- Create: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create `.env.example`** (values-free — NEVER paste real values):

```bash
# EazyExchange — every required environment variable, values-free.
# Local dev: copy to .env.local. Deploys: set the same names in Vercel.

# --- Supabase ----------------------------------------------------------------
# Project URL (Supabase Dashboard -> Settings -> API).
NEXT_PUBLIC_SUPABASE_URL=
# Publishable (anon) key. Safe in the browser - RLS is the boundary.
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Service-role secret key. BYPASSES RLS. Server only, never NEXT_PUBLIC_*.
# Rotation: docs/security/key-rotation-runbook.md
SUPABASE_SERVICE_ROLE_KEY=

# --- Email (Resend) ----------------------------------------------------------
RESEND_API_KEY=
# Must be "Name <mailbox@verified-domain>" - a bare domain breaks sends.
EMAIL_FROM=
# Recipient for the in-app organizer feedback widget.
FEEDBACK_EMAIL=

# --- App ---------------------------------------------------------------------
# Canonical origin, e.g. https://eazyexchange.com. GOTCHA: in Vercel this must
# be a NON-sensitive env var - sensitive vars are hidden from the client build
# and would bake into the browser bundle as an empty string.
NEXT_PUBLIC_APP_URL=

# --- Stripe (billing) ----------------------------------------------------------
STRIPE_SECRET_KEY=
# Signing secret of the prod webhook endpoint (/api/stripe/webhook).
STRIPE_WEBHOOK_SECRET=
# Price IDs for the three annual plans.
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_SCALE=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

- [ ] **Step 2: Point CLAUDE.md at it**

In `CLAUDE.md` "Local Development", replace the hardcoded 4-variable env block:

```markdown
Environment variables required (create `.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
```
```

with:

```markdown
Environment variables: copy `.env.example` (the authoritative, commented list of
every required variable) to `.env.local` and fill it in. Key rotation:
`docs/security/key-rotation-runbook.md`.
```

- [ ] **Step 3: Verify nothing secret is staged, then commit**

```bash
git diff --cached --stat   # after git add - confirm ONLY .env.example + CLAUDE.md
grep -E '=(.+)$' .env.example && echo "FAIL: values present" || echo "OK: values-free"
git add .env.example CLAUDE.md
git commit -m "docs: values-free .env.example as the authoritative env reference"
```

### Task 11: Key-rotation runbook

**Files:**
- Create: `docs/security/key-rotation-runbook.md`

- [ ] **Step 1: Write the runbook**

```markdown
# Key rotation runbook

Goal: any key rotates in ~15 minutes with zero downtime. Universal order:
**create new → set in every consumer → redeploy/verify → revoke old.** Never
revoke first. Worked example: the 2026-06-28 emergency rotation (exposed
service-role JWT + Resend key) followed exactly this order — this document
turns it into a drill.

## Where each secret lives

| Secret | Issued by | Consumed by |
|---|---|---|
| SUPABASE_SERVICE_ROLE_KEY (sb_secret_…) | Supabase → Settings → API keys | Vercel env (all envs), `.env.local` |
| NEXT_PUBLIC_SUPABASE_ANON_KEY (sb_publishable_…) | Supabase → Settings → API keys | Vercel env, `.env.local` (baked into browser bundle) |
| RESEND_API_KEY | Resend → API Keys | Vercel env, `.env.local` |
| STRIPE_SECRET_KEY | Stripe → Developers → API keys | Vercel env |
| STRIPE_WEBHOOK_SECRET | Stripe → the `/api/stripe/webhook` endpoint | Vercel env |

The `send-reminders` edge function uses Supabase-injected credentials — no
manual update on rotation.

## Supabase service-role key (highest blast radius — bypasses RLS)

1. Supabase Dashboard → Settings → API keys → create a **new secret key**.
2. Vercel → Settings → Environment Variables → update `SUPABASE_SERVICE_ROLE_KEY`
   in Production/Preview/Development; update `.env.local`.
3. Redeploy (`vercel redeploy` or push). Verify: log in, open the Candidatures
   page (admin-client read), submit a test feedback (service-role email path).
4. Supabase → **deactivate** the old secret key. Watch Vercel runtime logs for
   401s for a few minutes.

## Supabase publishable/anon key

Same flow, plus: it is baked into the client bundle at build time, so the
redeploy in step 3 is mandatory, and the old key keeps working in already-open
browser tabs until they reload — deactivate old only after a full redeploy.

## Resend key

1. Resend → API Keys → create new key.
2. Update Vercel env + `.env.local`; redeploy.
3. Send a test (feedback widget or « Relancer » on a test student).
4. Revoke the old key. Local gotcha: an old key exported in the shell shadows
   `.env.local` — `unset RESEND_API_KEY` and restart `pnpm dev`.

## Stripe secret key

1. Stripe → Developers → API keys → **Roll** the secret key (Stripe keeps the
   old one alive for up to 24 h — pick the window).
2. Update Vercel env; redeploy; run a €0-risk check: open /billing (card display
   uses the key) and confirm no 500.
3. After the roll window, the old key dies automatically.

## Stripe webhook signing secret

1. Stripe → Webhooks → the prod endpoint → roll the signing secret.
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel; redeploy quickly (events sent
   in-between fail signature verification and are retried by Stripe).
3. Confirm the next event shows 200 in Stripe's delivery log.

## After any rotation

- Confirm nothing was committed: `git log -S <old-key-fragment> --oneline` is empty.
- Note date + reason in this file's log below.

## Rotation log

- 2026-06-28 — service-role JWT + Resend key (reactive: exposure during review).
  Migrated to sb_secret_/sb_publishable_ key format; legacy JWTs deactivated.
```

- [ ] **Step 2: Commit**

```bash
git add docs/security/key-rotation-runbook.md
git commit -m "docs: key-rotation runbook (15-minute drill, all providers)"
```

### Task 12: Admin-client call-site classification + billing session-client swaps

**Files:**
- Create: `docs/security/service-role-callsites.md`
- Modify: `app/billing/page.tsx`, `app/billing/return/page.tsx`, `actions/settings.ts`

**Interfaces:**
- Consumes: RLS policies "users can read their school" (`schools` SELECT, `id = my_school_id()`) and "students read themselves" (`users` SELECT, `id = auth.uid()`) — both cover the swapped reads. Only `UPDATE` on `schools` was revoked from clients (20260701000001), SELECT is intact.

- [ ] **Step 1: Write the classification doc**

Create `docs/security/service-role-callsites.md`:

```markdown
# Service-role (`createAdminClient`) call sites — classification

Rule of the audit (2026-07-07 hardening spec, W3): every call site is either
(a) **genuinely needs the RLS bypass**, or (b) **reducible** to the session
client / a narrow `SECURITY DEFINER` RPC. Reducible sites were migrated; the
rest are justified here. Additional rule adopted for RPCs: **nothing beyond a
first name goes onto the anon-callable surface** — token-keyed reads that
return more PII stay behind service-role server actions so PII never becomes
directly PostgREST-callable.

| Call site | Class | Status / justification |
|---|---|---|
| `lib/rate-limit.ts` (check_rate_limit RPC) | a | RPC execute deliberately revoked from anon/authenticated; service role is the only caller |
| `lib/auth/provision.ts` | a | signup creates school + profile before any session exists (auth.admin) |
| `app/auth/callback/route.ts` | a | invite-only enforcement: deletes orphan Google auth users (auth.admin) |
| `app/api/stripe/webhook/route.ts` | a | cross-tenant billing writes; client UPDATE on schools is revoked by design |
| `app/billing/checkout/route.ts`, `app/billing/portal/route.ts` | a | write `stripe_customer_id` on schools (client UPDATE revoked) |
| `app/billing/page.tsx` | b | **migrated** → session client (own profile + own school, RLS covers) |
| `app/billing/return/page.tsx` | b | **migrated** → session client |
| `actions/settings.ts` getBillingOverview | b | **migrated** → session client for the school read |
| `actions/settings.ts` inviteOrganizer / revokeOrganizerInvite / removeOrganizer | a | organizer_invites has no client policies (deliberate); removeOrganizer needs auth.admin.deleteUser |
| `actions/exchanges.ts` createExchange (collaborator invites) | a | same organizer_invites rationale |
| `actions/join.ts` | a | anonymous token claim + auth.admin.createUser |
| `actions/applications.ts` startApplication / saveApplicationDraft / submitApplication / uploadApplicationPhoto / respondToInvitation | a | token is the only auth; multi-table writes + auth.admin + storage |
| `actions/applications.ts` sendApplicationResumeLink | a | reads the applicant email to send mail; must stay behind the rate-limited action |
| `actions/applications.ts` getApplicationDraft | a | returns the full draft PII + signs a storage URL — stays off the anon RPC surface by the first-name rule |
| `actions/applications.ts` getInvitation | a | returns applicant full name — same rule |
| `actions/applications.ts` getApplicationForReview | a | signs an application-photos URL (bucket has no organizer storage policy; authz is asserted in code first) |
| `actions/applications.ts` peekApplicationDraft | b | **migrated** → anon RPC `peek_application_draft` (Task 13) |
| `app/apply/[slug]/page.tsx` | b | **migrated** → anon RPC `get_apply_page_exchange` (Task 13) |

Review checklist for future code: a new `createAdminClient()` call needs a row
in this table (class + justification) in the same PR.
```

- [ ] **Step 2: Swap `app/billing/page.tsx` to the session client**

Remove the `createAdminClient` import and replace:

```tsx
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const { data: school } = await admin
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()
```

with:

```tsx
  // Own profile + own school: RLS covers both reads — no service role needed.
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', user.id).maybeSingle()
  if (!profile || profile.role !== 'organizer') redirect('/my-forms')

  const { data: school } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', profile.school_id).single()
```

(Keep `export const dynamic = 'force-dynamic'` — the page must never serve a stale subscription state.)

- [ ] **Step 3: Swap `app/billing/return/page.tsx` the same way**

Remove the `createAdminClient` import and replace:

```tsx
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  const { data: school } = profile
    ? await admin.from('schools')
        .select('subscription_status, plan, grace_until').eq('id', profile.school_id).single()
    : { data: null }
```

with:

```tsx
  const { data: profile } = await supabase
    .from('users').select('school_id').eq('id', user.id).maybeSingle()
  const { data: school } = profile
    ? await supabase.from('schools')
        .select('subscription_status, plan, grace_until').eq('id', profile.school_id).single()
    : { data: null }
```

- [ ] **Step 4: Swap the school read in `actions/settings.ts` getBillingOverview**

Replace:

```ts
  const admin = createAdminClient()
  const { data: school } = await admin
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', ctx.schoolId).single()
```

with:

```ts
  const { data: school } = await supabase
    .from('schools')
    .select('subscription_status, plan, grace_until, stripe_customer_id')
    .eq('id', ctx.schoolId).single()
```

(`createAdminClient` stays imported in settings.ts — the invite/remove actions still use it.)

- [ ] **Step 5: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add docs/security/service-role-callsites.md app/billing/page.tsx app/billing/return/page.tsx actions/settings.ts
git commit -m "security: classify all admin-client call sites; billing reads to session client"
```

### Task 13: Anon-RPC migrations for the two zero/low-PII public reads

**Files:**
- Create: `supabase/migrations/20260707000004_anon_read_rpcs.sql`, `lib/supabase/anon.ts`
- Modify: `types/db.ts`, `app/apply/[slug]/page.tsx`, `actions/applications.ts`, `tests/rls/rpc.test.ts` (new), `actions/__tests__/applications.test.ts` (mock update if needed)

**Interfaces:**
- Produces: `createAnonClient()` from `lib/supabase/anon.ts`; RPCs `get_apply_page_exchange(p_slug text)` → `(name, application_open, application_deadline)` and `peek_application_draft(p_token text)` → `(status, first_name, language, resume_token_expires_at)`.

- [ ] **Step 1: Write the failing RLS-suite test for the RPCs**

Create `tests/rls/rpc.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => {
  fx = await seedFixtures(sql)
})
afterAll(async () => {
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('anon read RPCs (W3)', () => {
  it('get_apply_page_exchange: anon gets the window state for a real slug, nothing else', async () => {
    const rows = await runAs(sql, null, (tx) =>
      tx`select * from get_apply_page_exchange(${fx.applySlugA})`)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['application_deadline', 'application_open', 'name'])
    expect(rows[0].application_open).toBe(true)
  })

  it('get_apply_page_exchange: unknown slug returns zero rows', async () => {
    expect(await runAs(sql, null, (tx) =>
      tx`select * from get_apply_page_exchange('no-such-slug')`)).toHaveLength(0)
  })

  it('peek_application_draft: anon gets status + first name only for a valid token', async () => {
    const rows = await runAs(sql, null, (tx) =>
      tx`select * from peek_application_draft(${fx.resumeTokenA})`)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(['first_name', 'language', 'resume_token_expires_at', 'status'])
    expect(rows[0].first_name).toBe('Testine')
    expect(rows[0].status).toBe('submitted')
  })

  it('peek_application_draft: wrong token returns zero rows', async () => {
    expect(await runAs(sql, null, (tx) =>
      tx`select * from peek_application_draft('wrong-token')`)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:rls -- rpc`
Expected: FAIL — `function get_apply_page_exchange(unknown) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260707000004_anon_read_rpcs.sql`:

```sql
-- W3 blast-radius reduction: narrow anon-callable read functions so the public
-- apply entry page and the same-device draft peek no longer run on the
-- service-role client. Rule: nothing beyond a first name on the anon surface.
-- SECURITY DEFINER + pinned search_path + explicit grants, mirroring
-- check_rate_limit (20260630000004).

-- /apply/<slug> landing state. The slug is public by design; returns no PII.
create or replace function get_apply_page_exchange(p_slug text)
  returns table (name text, application_open boolean, application_deadline date)
  language sql stable security definer set search_path = public as $$
    select e.name, e.application_open, e.application_deadline
    from exchanges e
    where e.apply_slug = p_slug;
$$;
revoke execute on function public.get_apply_page_exchange(text) from public;
grant execute on function public.get_apply_page_exchange(text) to anon, authenticated;

-- Same-device welcome-back peek for a stored resume token: live-draft state,
-- first name and language only — never the rest of the draft.
create or replace function peek_application_draft(p_token text)
  returns table (status text, first_name text, language text, resume_token_expires_at timestamptz)
  language sql stable security definer set search_path = public as $$
    select a.status, a.data->>'first_name', a.language, a.resume_token_expires_at
    from applications a
    where a.resume_token = p_token;
$$;
revoke execute on function public.peek_application_draft(text) from public;
grant execute on function public.peek_application_draft(text) to anon, authenticated;
```

Apply locally and re-run the test:

```bash
pnpm exec supabase db reset
pnpm test:rls
```

Expected: ALL PASS (rpc + the whole matrix — the reset also re-proves the migrations).

- [ ] **Step 4: Add the RPC types**

In `types/db.ts`, extend `Database.public.Functions`:

```ts
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      get_apply_page_exchange: {
        Args: { p_slug: string }
        Returns: { name: string; application_open: boolean; application_deadline: string | null }[]
      }
      peek_application_draft: {
        Args: { p_token: string }
        Returns: {
          status: string
          first_name: string | null
          language: string
          resume_token_expires_at: string | null
        }[]
      }
    }
```

- [ ] **Step 5: Create the anon client helper**

Create `lib/supabase/anon.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

// Cookie-less anon-key client for public reads that go through narrowly-granted
// SECURITY DEFINER RPCs (see docs/security/service-role-callsites.md). No
// session, no service role — the explicit function grants are the boundary.
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 6: Swap the apply page**

In `app/apply/[slug]/page.tsx`, replace the import and the fetch:

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
```
→
```tsx
import { createAnonClient } from '@/lib/supabase/anon'
```

and

```tsx
  const admin = createAdminClient()
  const { data: exchange } = await admin
    .from('exchanges')
    .select('name, application_open, application_deadline')
    .eq('apply_slug', slug)
    .maybeSingle()
```
→
```tsx
  const anon = createAnonClient()
  const { data: exchange } = await anon
    .rpc('get_apply_page_exchange', { p_slug: slug })
    .maybeSingle()
```

Also update the file's top comment ("cookie-less admin client" → "cookie-less anon client through a narrowly-granted RPC"). Everything below (`closed` computation, rendering) consumes the same three fields — unchanged.

- [ ] **Step 7: Swap `peekApplicationDraft`**

In `actions/applications.ts`, add the import `import { createAnonClient } from '@/lib/supabase/anon'` and replace the function body:

```ts
export async function peekApplicationDraft(
  token: string,
): Promise<{ live: boolean; firstName: string | null; language: 'en' | 'fr' }> {
  // Anon-key RPC (not the service role): returns status + first name only.
  const anon = createAnonClient()
  const { data: app } = await anon
    .rpc('peek_application_draft', { p_token: token })
    .maybeSingle()
  const language: 'en' | 'fr' = app?.language === 'fr' ? 'fr' : 'en'
  if (!app || tokenExpired(app.resume_token_expires_at) || app.status !== 'draft') {
    return { live: false, firstName: null, language }
  }
  return { live: true, firstName: app.first_name, language }
}
```

- [ ] **Step 8: Fix unit-test mocks if needed**

Run: `pnpm test`
If `actions/__tests__/applications.test.ts` (or a sibling) fails because `peekApplicationDraft`/the apply page now import `@/lib/supabase/anon`, add next to the existing `vi.mock('@/lib/supabase/admin', …)`:

```ts
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({
    rpc: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
  }),
}))
```

Re-run until green.

- [ ] **Step 9: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit && pnpm test:rls
git add supabase/migrations/20260707000004_anon_read_rpcs.sql lib/supabase/anon.ts types/db.ts app/apply/\[slug\]/page.tsx actions/applications.ts tests/rls/rpc.test.ts actions/__tests__/applications.test.ts
git commit -m "security: anon RPCs for apply-page + draft-peek reads (service role off the public read path)"
```

**Prod note (ship time, Task 20):** this migration is applied to prod via MCP `apply_migration` — until then prod keeps working on the old code path; the branch preview needs the migration or /apply pages 500 → live-verify /apply only after prod migration at ship, or on a local `pnpm dev` against the local stack.

**PHASE W3 BOUNDARY — `/clear` point. Resume prompt: « resume Phase W4 of docs/superpowers/plans/2026-07-07-security-hardening.md »**

---
# Phase W4 — Immutable audit trail

**Decision recorded (spec asked):** students do **not** see their submission-decision history in v1. Read policy is organizer-only, own school. No organizer-facing UI in v1 either — the table + writes are the deliverable.

### Task 14: `audit_log` migration + types + RLS-suite proof of immutability

**Files:**
- Create: `supabase/migrations/20260707000005_audit_log.sql`, `tests/rls/audit-log.test.ts`
- Modify: `types/db.ts`

**Interfaces:**
- Produces: table `audit_log(id, actor_user_id, actor_school_id, action, target_type, target_id, metadata, created_at)`; type `AuditLog` and Tables entry `audit_log` in `types/db.ts` (Update typed as `Record<string, never>` so `.update()` is unusable from typed code).

- [ ] **Step 1: Write the failing RLS test**

Create `tests/rls/audit-log.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures
let entryId: string

beforeAll(async () => {
  fx = await seedFixtures(sql)
  // Service-path write (postgres stands in for the service role: both bypass RLS).
  const [row] = await sql`
    insert into audit_log (actor_user_id, actor_school_id, action, target_type, target_id)
    values (${fx.orgA}, ${fx.schoolA}, 'submission.approved', 'submission', ${fx.submissionA})
    returning id`
  entryId = row.id as string
})
afterAll(async () => {
  await sql`delete from audit_log where id = ${entryId}`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('audit_log', () => {
  it('school A organizer reads own-school entries', async () => {
    expect(await runAs(sql, fx.orgA, (tx) =>
      tx`select id from audit_log where id = ${entryId}`)).toHaveLength(1)
  })

  it('school B organizer and students see nothing', async () => {
    for (const uid of [fx.orgB, fx.studentA, fx.studentB]) {
      let rows
      try {
        rows = await runAs(sql, uid, (tx) => tx`select id from audit_log where id = ${entryId}`)
      } catch (e) {
        if ((e as { code?: string }).code === '42501') rows = []
        else throw e
      }
      expect(rows, `persona ${uid}`).toHaveLength(0)
    }
  })

  it('no client role can insert', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`insert into audit_log (actor_user_id, actor_school_id, action, target_type)
         values (${fx.orgA}, ${fx.schoolA}, 'forged', 'submission')`))
  })

  it('no client role can update or delete (append-only)', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update audit_log set action = 'tampered' where id = ${entryId}`))
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`delete from audit_log where id = ${entryId}`))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:rls -- audit-log`
Expected: FAIL — `relation "audit_log" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260707000005_audit_log.sql`:

```sql
-- W4: append-only audit trail for privileged actions. Written ONLY by the
-- service-role client (lib/audit.ts); no client role can INSERT/UPDATE/DELETE
-- (no policies for those verbs + the default grants are revoked, belt and
-- braces). Organizers can read their own school's entries.
--
-- Deliberately NO foreign keys: audit rows must survive the deletion of the
-- actor or target (e.g. removeOrganizer deletes the user; the trail stays).
-- PII rule: row ids and action types only — never names, emails, notes or
-- submission contents.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,          -- null = system actor (e.g. Stripe webhook)
  actor_school_id uuid,        -- school context the action ran in
  action text not null,        -- e.g. 'submission.approved' (see lib/audit.ts)
  target_type text not null,   -- 'submission' | 'application' | 'user' | 'organizer_invite' | 'exchange' | 'school'
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_school_idx on audit_log (actor_school_id, created_at desc);

alter table audit_log enable row level security;

-- Read-only for a school's organizers. (select …) wrappers per the STABLE
-- initplan convention (20260705000004).
create policy "organizers read school audit log" on audit_log for select
  using ((select my_role()) = 'organizer' and actor_school_id = (select my_school_id()));

-- Append-only enforcement beyond "no policy": drop the default table grants so
-- even a future over-permissive policy cannot re-open client writes.
revoke insert, update, delete, truncate on audit_log from anon, authenticated;
```

Apply locally and re-run:

```bash
pnpm exec supabase db reset
pnpm test:rls
```

Expected: ALL PASS.

- [ ] **Step 4: Add the types**

In `types/db.ts`, after the `Feedback` type:

```ts
export type AuditLog = {
  id: string
  actor_user_id: string | null
  actor_school_id: string | null
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, string | number | boolean | null>
  created_at: string
}
```

and in `Database.public.Tables`, after the `rate_limits` entry:

```ts
      audit_log: TableDef<
        AuditLog,
        Omit<AuditLog, 'id' | 'created_at' | 'metadata'> & Partial<Pick<AuditLog, 'metadata'>>,
        Record<string, never> // append-only: .update() is a type error in practice
      >
```

- [ ] **Step 5: Gate + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add supabase/migrations/20260707000005_audit_log.sql types/db.ts tests/rls/audit-log.test.ts
git commit -m "feat: append-only audit_log table (RLS: organizer read own school, service-role writes only)"
```

### Task 15: `lib/audit.ts` helper

**Files:**
- Create: `lib/audit.ts`, `lib/__tests__/audit.test.ts`

**Interfaces:**
- Produces: `logAudit(entry): Promise<void>` and `type AuditAction` — consumed by Tasks 16–17. `logAudit` **never throws** (an audit failure must not roll back the action) and is **awaited** at call sites (fire-and-forget `void` risks the serverless runtime freezing before the insert lands).

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/audit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn(async (_table: string, _row: unknown) => ({ error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({ insert: (row: unknown) => insertMock(table, row) }),
  }),
}))

import { logAudit } from '../audit'

describe('logAudit', () => {
  beforeEach(() => insertMock.mockClear())

  it('inserts an audit_log row carrying ids and action only', async () => {
    await logAudit({
      action: 'submission.approved',
      actorUserId: 'org-1',
      actorSchoolId: 'school-1',
      targetType: 'submission',
      targetId: 'sub-1',
      metadata: { assignment_id: 'a-1' },
    })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith('audit_log', {
      action: 'submission.approved',
      actor_user_id: 'org-1',
      actor_school_id: 'school-1',
      target_type: 'submission',
      target_id: 'sub-1',
      metadata: { assignment_id: 'a-1' },
    })
  })

  it('defaults metadata to {} ', async () => {
    await logAudit({
      action: 'exchange.archived', actorUserId: 'org-1', actorSchoolId: 'school-1',
      targetType: 'exchange', targetId: 'ex-1',
    })
    expect(insertMock.mock.calls[0][1]).toMatchObject({ metadata: {} })
  })

  it('swallows insert errors — an audit failure must never break the action', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '42501' } })
    await expect(
      logAudit({
        action: 'submission.rejected', actorUserId: 'org-1', actorSchoolId: 'school-1',
        targetType: 'submission', targetId: 'sub-1',
      }),
    ).resolves.toBeUndefined()
  })

  it('swallows thrown errors too', async () => {
    insertMock.mockRejectedValueOnce(new Error('network down'))
    await expect(
      logAudit({
        action: 'organizer.removed', actorUserId: 'org-1', actorSchoolId: 'school-1',
        targetType: 'user', targetId: 'u-2',
      }),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- audit`
Expected: FAIL — `Cannot find module '../audit'`.

- [ ] **Step 3: Implement**

Create `lib/audit.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'submission.approved'
  | 'submission.rejected'
  | 'application.accepted'
  | 'application.rejected'
  | 'organizer.invited'
  | 'organizer.invite_revoked'
  | 'organizer.removed'
  | 'exchange.archived'
  | 'exchange.restored'
  | 'billing.subscription_updated'
  | 'billing.grace_started'

export type AuditTargetType =
  | 'submission' | 'application' | 'user' | 'organizer_invite' | 'exchange' | 'school'

// Append an entry to the tamper-evident audit_log (service-role only — clients
// have no write path, see 20260707000005). Await it at call sites, but it NEVER
// throws: an audit hiccup must not roll back the privileged action itself.
// PII rule: ids and action types only — never names, emails, notes or contents.
export async function logAudit(entry: {
  action: AuditAction
  actorUserId: string | null
  actorSchoolId: string | null
  targetType: AuditTargetType
  targetId: string | null
  metadata?: Record<string, string | number | boolean | null>
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_log').insert({
      action: entry.action,
      actor_user_id: entry.actorUserId,
      actor_school_id: entry.actorSchoolId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      metadata: entry.metadata ?? {},
    })
    if (error) console.error('[audit] write failed:', error.code ?? 'unknown')
  } catch {
    console.error('[audit] write failed: unexpected')
  }
}
```

- [ ] **Step 4: Run to verify pass, gate, commit**

```bash
pnpm test -- audit
pnpm lint && npx tsc --noEmit
git add lib/audit.ts lib/__tests__/audit.test.ts
git commit -m "feat: logAudit helper — awaited, non-throwing, ids-only"
```

### Task 16: Instrument the nine privileged actions

**Files:**
- Modify: `actions/submissions.ts`, `actions/applications.ts`, `actions/settings.ts`, `lib/team/invite.ts`, `lib/team/__tests__/invite.test.ts` (assertion shape)
- Create: `actions/__tests__/audit-instrumentation.test.ts`

**Interfaces:**
- Consumes: `logAudit`, `AuditAction` (Task 15)
- Produces: `createAndSendOrganizerInvite` now returns `{ ok: true; inviteId: string } | { ok: false; message: string }` (so the invite entry can carry a target id). `createExchange` only reads `.ok`, so it is unaffected.

- [ ] **Step 1: Write the failing instrumentation tests**

Create `actions/__tests__/audit-instrumentation.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logAudit = vi.fn(async () => {})
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendRejectionEmail: vi.fn(),
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// Table-aware minimal builder (same pattern as submissions.test.ts).
function makeClient() {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: () => builder,
        update: () => builder,
        maybeSingle: async () => {
          if (table === 'assignments') {
            return { data: { form_templates: { school_id: 'school-1', exchange_id: 'ex-1' } }, error: null }
          }
          if (table === 'exchanges') return { data: { archived_at: null, name: 'Échange' }, error: null }
          if (table === 'applications') {
            return {
              data: {
                id: 'app-1', school_id: 'school-1', exchange_id: 'ex-1',
                status: 'submitted', email: 'x@x.test', data: {},
              },
              error: null,
            }
          }
          return { data: null, error: null }
        },
        single: async () => {
          if (table === 'submissions') return { data: { id: 'sub-1', status: 'submitted' }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}))
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
}))

import { approveSubmission } from '../submissions'
import { rejectApplication } from '../applications'

describe('audit instrumentation', () => {
  beforeEach(() => logAudit.mockClear())

  it('approveSubmission writes a submission.approved entry', async () => {
    await approveSubmission('a-1')
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'submission.approved',
        actorUserId: 'org-1',
        actorSchoolId: 'school-1',
        targetType: 'submission',
        targetId: 'sub-1',
      }),
    )
  })

  it('rejectApplication writes an application.rejected entry (no note content)', async () => {
    await rejectApplication('app-1', 'note privée', false)
    expect(logAudit).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'application.rejected',
        actorUserId: 'org-1',
        actorSchoolId: 'school-1',
        targetType: 'application',
        targetId: 'app-1',
      }),
    )
    // PII rule: the free-text note must never reach the audit row.
    expect(JSON.stringify(logAudit.mock.calls[0][0])).not.toContain('note privée')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- audit-instrumentation`
Expected: FAIL — `logAudit` not called (0 calls).

- [ ] **Step 3: Instrument `actions/submissions.ts`**

Add the import:

```ts
import { logAudit } from '@/lib/audit'
```

In `approveSubmission`, after the successful update (`if (error) throw error`) and before `revalidatePath('/exchanges')`:

```ts
  const profile = await getProfile()
  await logAudit({
    action: 'submission.approved',
    actorUserId: user.id,
    actorSchoolId: profile?.school_id ?? null,
    targetType: 'submission',
    targetId: submission.id,
    metadata: { assignment_id: assignmentId },
  })
```

In `rejectSubmission`, after its successful update (`if (error) throw error`) and before the student-notification block:

```ts
  const profile = await getProfile()
  await logAudit({
    action: 'submission.rejected',
    actorUserId: user.id,
    actorSchoolId: profile?.school_id ?? null,
    targetType: 'submission',
    targetId: submission.id,
    metadata: { assignment_id: assignmentId }, // never the note text
  })
```

- [ ] **Step 4: Instrument `actions/applications.ts`**

Add the import `import { logAudit } from '@/lib/audit'`.

In `acceptApplication`, after the successful update and before the exchange-name fetch:

```ts
  await logAudit({
    action: 'application.accepted',
    actorUserId: user.id,
    actorSchoolId: app.school_id,
    targetType: 'application',
    targetId: applicationId,
    metadata: { exchange_id: app.exchange_id },
  })
```

In `rejectApplication`, after the successful update and before `if (sendEmail) {`:

```ts
  await logAudit({
    action: 'application.rejected',
    actorUserId: user.id,
    actorSchoolId: app.school_id,
    targetType: 'application',
    targetId: applicationId,
    metadata: { exchange_id: app.exchange_id, email_sent: sendEmail },
  })
```

(The bulk actions loop these two, so batches are audited per item for free.)

- [ ] **Step 5: Return the invite id from `lib/team/invite.ts`**

Change the result type and the success return:

```ts
export type InviteResult = { ok: true; inviteId: string } | { ok: false; message: string }
```
and the last line of the function:
```ts
  return { ok: true, inviteId: invite.id }
```

Run `pnpm test -- invite`; where `lib/team/__tests__/invite.test.ts` asserts strict equality with `{ ok: true }`, relax to shape-matching:

```ts
expect(result).toMatchObject({ ok: true })
```

- [ ] **Step 6: Instrument `actions/settings.ts`**

Add the import `import { logAudit } from '@/lib/audit'`.

`inviteOrganizer` — after `if (!result.ok) throw new Error(result.message)`:

```ts
  await logAudit({
    action: 'organizer.invited',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'organizer_invite',
    targetId: result.inviteId,
  })
```

`revokeOrganizerInvite` — after its update's error check:

```ts
  await logAudit({
    action: 'organizer.invite_revoked',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'organizer_invite',
    targetId: inviteId,
  })
```

`removeOrganizer` — after the successful `deleteUser`:

```ts
  await logAudit({
    action: 'organizer.removed',
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'user',
    targetId: userId,
  })
```

`archiveExchange` / `restoreExchange` — after each one's error check:

```ts
  await logAudit({
    action: 'exchange.archived', // 'exchange.restored' in restoreExchange
    actorUserId: ctx.userId,
    actorSchoolId: ctx.schoolId,
    targetType: 'exchange',
    targetId: exchangeId,
  })
```

- [ ] **Step 7: Run all tests, fix collateral mocks**

Run: `pnpm test`
Expected: the two new instrumentation tests pass. Existing suites that import the touched actions (`remove-organizer.test.ts`, `applications.test.ts`, `bulk-applications.test.ts`, `exchanges.test.ts`, …) may fail with `Cannot find module '@/lib/audit'` inside their mock graph — add to each affected file:

```ts
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
```

Re-run until fully green.

- [ ] **Step 8: Gate + commit**

```bash
pnpm lint && npx tsc --noEmit && pnpm test
git add actions/submissions.ts actions/applications.ts actions/settings.ts lib/team/invite.ts lib/team/__tests__/invite.test.ts actions/__tests__/audit-instrumentation.test.ts   # plus any test files patched in Step 7, BY NAME
git commit -m "feat: audit-trail entries for the nine privileged organizer actions"
```

### Task 17: Instrument the Stripe webhook

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

**Interfaces:**
- Consumes: `logAudit` (Task 15); `resolveBillingUpdate` already returns `{ customerId, patch, setGraceIfNull? }` — unchanged.

- [ ] **Step 1: Edit the route**

Add the import `import { logAudit } from '@/lib/audit'`.

In the `setGraceIfNull` branch, after the grace update:

```ts
    if (school && !school.grace_until) {
      await admin
        .from('schools')
        .update({ grace_until: new Date(Date.now() + GRACE_MS).toISOString() })
        .eq('id', school.id)
      await logAudit({
        action: 'billing.grace_started',
        actorUserId: null, // system actor: Stripe webhook
        actorSchoolId: school.id,
        targetType: 'school',
        targetId: school.id,
      })
    }
```

Replace the patch branch:

```ts
  if (Object.keys(update.patch).length > 0) {
    await admin.from('schools').update(update.patch).eq('stripe_customer_id', update.customerId)
  }
  return new Response('ok', { status: 200 })
```

with:

```ts
  if (Object.keys(update.patch).length > 0) {
    const { data: patched } = await admin
      .from('schools')
      .update(update.patch)
      .eq('stripe_customer_id', update.customerId)
      .select('id')
    for (const school of patched ?? []) {
      await logAudit({
        action: 'billing.subscription_updated',
        actorUserId: null, // system actor: Stripe webhook
        actorSchoolId: school.id,
        targetType: 'school',
        targetId: school.id,
        metadata: {
          subscription_status: update.patch.subscription_status ?? null,
          plan: update.patch.plan ?? null,
        },
      })
    }
  }
  return new Response('ok', { status: 200 })
```

- [ ] **Step 2: Gate + commit**

Run: `pnpm test` (the webhook's logic tests target the pure `resolveBillingUpdate` — unaffected), `pnpm lint`, `npx tsc --noEmit`.

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: audit entries for webhook-driven subscription/grace changes"
```

**PHASE W4 BOUNDARY — `/clear` point. Resume prompt: « resume Phase W5 of docs/superpowers/plans/2026-07-07-security-hardening.md »**

---
# Phase W5 — Defense-in-depth on anonymous flows

**Policy decided (spec asked):** the three keys that gate **outbound email** fail closed — `apply_email:*`, `resume_email:*` (both in `actions/applications.ts`) and `team-invite:*` (`actions/settings.ts`). Everything else (the IP-keyed entry caps `apply_ip`/`resume_ip`/`join`, and `pwchange`) stays fail-open for availability: they gate form entry / already-authenticated flows, not mail volume.

### Task 18: Fail-closed rate limit for mail-sending keys

**Files:**
- Create: `lib/__tests__/rate-limit.test.ts`
- Modify: `lib/rate-limit.ts`, `actions/applications.ts`, `actions/settings.ts`

**Interfaces:**
- Produces: `enforceRateLimitStrict(key, limit, windowSeconds): Promise<void>` and `RATE_LIMIT_UNAVAILABLE_MESSAGE` from `lib/rate-limit.ts`. Existing `enforceRateLimit` behavior unchanged.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/rate-limit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcMock = vi.fn(async (_fn: string, _args: unknown) =>
  ({ data: true as boolean | null, error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (fn: string, args: unknown) => rpcMock(fn, args) }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import {
  enforceRateLimit,
  enforceRateLimitStrict,
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_UNAVAILABLE_MESSAGE,
} from '../rate-limit'

describe('rate limits', () => {
  beforeEach(() => {
    rpcMock.mockClear()
    rpcMock.mockResolvedValue({ data: true, error: null })
  })

  it('both variants allow when the counter is within the limit', async () => {
    await expect(enforceRateLimit('k', 3, 60)).resolves.toBeUndefined()
    await expect(enforceRateLimitStrict('k', 3, 60)).resolves.toBeUndefined()
  })

  it('both variants throw the rate-limit message when over the limit', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    await expect(enforceRateLimit('k', 3, 60)).rejects.toThrow(RATE_LIMIT_MESSAGE)
    await expect(enforceRateLimitStrict('k', 3, 60)).rejects.toThrow(RATE_LIMIT_MESSAGE)
  })

  it('on a DB error the base variant fails OPEN (availability)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    await expect(enforceRateLimit('k', 3, 60)).resolves.toBeUndefined()
  })

  it('on a DB error the strict variant fails CLOSED (mail-sending cap)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'XX000' } })
    await expect(enforceRateLimitStrict('k', 3, 60)).rejects.toThrow(RATE_LIMIT_UNAVAILABLE_MESSAGE)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- rate-limit`
Expected: FAIL — `enforceRateLimitStrict` is not exported.

- [ ] **Step 3: Implement (shared core, two policies)**

In `lib/rate-limit.ts`, keep the imports and `clientIp()` untouched, then replace everything from the `// Throws RATE_LIMIT_MESSAGE …` comment (line 14) to the end of the file with:

```ts
// Throws RATE_LIMIT_MESSAGE when `key` exceeds `limit` calls per `windowSeconds`.
// Backed by check_rate_limit() in Postgres (atomic fixed window).
export const RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a little while and try again.'
export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  'This service is temporarily unavailable. Please try again in a few minutes.'

async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<'allowed' | 'limited' | 'error'> {
  const admin = createAdminClient()
  const { data: allowed, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) return 'error'
  return allowed === false ? 'limited' : 'allowed'
}

// Fails OPEN on an unexpected DB error: a transient blip must never block a
// legitimate applicant. Use ONLY for limits that gate form entry — anything
// that sends email uses enforceRateLimitStrict.
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const outcome = await checkRateLimit(key, limit, windowSeconds)
  if (outcome === 'error') {
    // Don't include the key — it can contain an applicant email (PII).
    console.error('[rate-limit] check failed, allowing request')
    return
  }
  if (outcome === 'limited') throw new Error(RATE_LIMIT_MESSAGE)
}

// Fails CLOSED: for the mail-sending keys, a DB blip removing the cap would
// mean unlimited mail from our sending domain (reputation + cost) — refuse
// instead of allowing.
export async function enforceRateLimitStrict(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const outcome = await checkRateLimit(key, limit, windowSeconds)
  if (outcome === 'error') {
    console.error('[rate-limit] check failed, BLOCKING mail-sending request')
    throw new Error(RATE_LIMIT_UNAVAILABLE_MESSAGE)
  }
  if (outcome === 'limited') throw new Error(RATE_LIMIT_MESSAGE)
}
```

(Keep `clientIp()` and the imports at the top of the file unchanged.)

- [ ] **Step 4: Swap the three mail-sending call sites**

`actions/applications.ts` — extend the import and swap the per-recipient caps (the IP caps stay fail-open):

```ts
import { enforceRateLimit, enforceRateLimitStrict, clientIp } from '@/lib/rate-limit'
```

In `startApplication`:
```ts
  await enforceRateLimit(`apply_ip:${ip}`, 10, 3600)
  await enforceRateLimitStrict(`apply_email:${email}`, 3, 3600)
```

In `sendApplicationResumeLink`:
```ts
  await enforceRateLimit(`resume_ip:${ip}`, 10, 3600)
  await enforceRateLimitStrict(`resume_email:${app.email}`, 3, 3600)
```

`actions/settings.ts` — extend the import and swap in `inviteOrganizer`:

```ts
import { enforceRateLimit, enforceRateLimitStrict } from '@/lib/rate-limit'
…
  await enforceRateLimitStrict(`team-invite:${ctx.schoolId}`, 10, 3600)
```

(`enforceRateLimit` remains used by `changePassword` in the same file.)

- [ ] **Step 5: Run everything, gate, commit**

```bash
pnpm test && pnpm lint && npx tsc --noEmit
git add lib/rate-limit.ts lib/__tests__/rate-limit.test.ts actions/applications.ts actions/settings.ts
git commit -m "security: mail-sending rate limits fail closed (apply_email, resume_email, team-invite)"
```

### Task 19: App-level scope check on `listApplications`

The sibling sweep is already done (this plan's exploration): every other organizer read carries an app-level scope check (`assertOrganizerInExchange` in students.ts, `assertExchangeInScope` in exchanges.ts, `assertOrganizerOwnsTemplate` in forms.ts, `assertOrganizerOwnsApplication`/`assertOrganizerOwnsAssignment` in applications/submissions). `listApplications` is the one read relying on RLS alone. W1's matrix is the primary guard; this is the belt-and-suspenders the spec asks for.

**Files:**
- Create: `actions/__tests__/list-applications.test.ts`
- Modify: `actions/applications.ts`

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/list-applications.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
  sendInvitationEmail: vi.fn(),
  sendApplicationRejectionEmail: vi.fn(),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
}))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: 'org-1' }),
  getProfile: async () => ({ id: 'org-1', role: 'organizer', school_id: 'school-1' }),
}))

// The exchange row the mocked client returns — set per test.
let exchangeRow: { school_a_id: string; school_b_id: string | null } | null = null

function makeClient() {
  return {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        order: async () => ({ data: [{ id: 'app-1' }], error: null }),
        maybeSingle: async () =>
          table === 'exchanges' ? { data: exchangeRow, error: null } : { data: null, error: null },
      }
      return builder
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { listApplications } from '../applications'

describe('listApplications scope check', () => {
  it("refuses an exchange belonging to another school (even if RLS would return rows)", async () => {
    exchangeRow = { school_a_id: 'school-OTHER', school_b_id: null }
    await expect(listApplications('ex-1')).rejects.toThrow('Unauthorized')
  })

  it('refuses an exchange the caller cannot even see', async () => {
    exchangeRow = null
    await expect(listApplications('ex-1')).rejects.toThrow('Unauthorized')
  })

  it("returns rows for the caller's own exchange", async () => {
    exchangeRow = { school_a_id: 'school-1', school_b_id: null }
    await expect(listApplications('ex-1')).resolves.toEqual([{ id: 'app-1' }])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test -- list-applications`
Expected: the first two tests FAIL (no scope check yet → resolves with rows).

- [ ] **Step 3: Add the check**

In `actions/applications.ts`, inside `listApplications`, after the organizer-role check and before the query:

```ts
  // Belt-and-suspenders with RLS (which already scopes rows to the caller's
  // school — proven by tests/rls/matrix.test.ts): refuse foreign exchange ids
  // outright so a future RLS refactor can never silently open this read.
  // Same shape as assertOrganizerInExchange in actions/students.ts.
  const { data: exchange } = await supabase
    .from('exchanges')
    .select('school_a_id, school_b_id')
    .eq('id', exchangeId)
    .maybeSingle()
  if (!exchange || (exchange.school_a_id !== profile.school_id && exchange.school_b_id !== profile.school_id)) {
    throw new Error('Unauthorized')
  }
```

- [ ] **Step 4: Run to verify pass, gate, commit**

```bash
pnpm test && pnpm lint && npx tsc --noEmit
git add actions/applications.ts actions/__tests__/list-applications.test.ts
git commit -m "security: explicit school-scope check on listApplications (belt-and-suspenders over RLS)"
```

---

# Task 20: Final gate + ship checklist

- [ ] **Step 1: Full gate on the branch**

```bash
pnpm lint && pnpm test && npx tsc --noEmit && pnpm test:rls
git push
gh run watch   # both CI jobs green on the branch
```

- [ ] **Step 2: PII / hygiene sweep before merge**

```bash
git diff main...HEAD --stat            # every file accounted for; no stray uploads (PII rule)
git log main..HEAD --oneline
```

- [ ] **Step 3: STOP — Bjorn's merge confirmation** (CLAUDE.md rule: merging deploys to production). Present the diff summary, the Task 8 checklist results and the audit output.

- [ ] **Step 4: Ship sequence (after confirmation)**

1. Apply the two migrations to prod via Supabase MCP `apply_migration`, in order: `20260707000004_anon_read_rpcs`, then `20260707000005_audit_log` (never `supabase db push` — drift trap).
2. Run MCP `get_advisors` (security + performance) — expect zero new findings.
3. Merge + push:
   ```bash
   git checkout main && git pull   # local main drifts behind origin — always check
   git merge --no-ff feature/security-hardening
   pnpm lint && pnpm test && npx tsc --noEmit
   git push && git branch -d feature/security-hardening
   ```
4. Watch the Vercel deploy to READY; spot-check prod: `/apply/<real-slug>` renders (proves the anon RPC), log in, approve a test submission, then verify one `audit_log` row exists via MCP `execute_sql` (`select action, target_type, created_at from audit_log order by created_at desc limit 5` — ids only, no PII).
5. Confirm both GitHub workflows ran green on `main`.
6. Update `.superpowers/sdd/progress.md` + auto-memory (phase entries; note the audit-cadence workflow now guards deps weekly).

---

## Coverage map (spec → tasks)

| Spec requirement | Task(s) |
|---|---|
| W1 matrix over 12 tables + storage ×3, positive cases, `pnpm test:rls`, CI-runnable, documented command | 1–6 |
| W1 planning decisions: separate vitest project; CI provisions Postgres via supabase CLI in GitHub Actions | 1, 6 |
| W2 upgrade off 14.2.35 (decision: 15.x — no patched 14.x exists), fragile-flow regression, audit clean | 7, 8 |
| W2 standing cadence + triage rule in CLAUDE.md | 9 |
| W3 `.env.example` (incl. NEXT_PUBLIC_APP_URL gotcha) | 10 |
| W3 rotation runbook (worked example 2026-06-28) | 11 |
| W3 call-site classification, reducible ones migrated or justified | 12, 13 |
| W3 migrations covered by W1 tests | 13 (`tests/rls/rpc.test.ts`) |
| W4 append-only audit_log, RLS read own school, no client writes, named actions instrumented, webhook, tests | 14–17 |
| W4 planning decision: students see own decision history? → **No** for v1 | Phase W4 header |
| W5 mail-sending limits fail closed (policy decided) + test | 18 |
| W5 explicit scope check on listApplications (sibling sweep: none other needed) | 19 |
| Build order W1→W2→W3→W4→W5; W3 policies added to W1 matrix | phase order, Task 13 |

