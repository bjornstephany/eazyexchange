# Signup Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep public signup open, but give every new self-registered organizer zero access until approved by hand, with named testers skipping the queue.

**Architecture:** The gate is one SECURITY DEFINER function. `my_role()` returns the caller's role only when `users.status = 'approved'`, which transitively gates ~30 table policies, 5 storage policies and `claim_school()` — every organizer-reachable path in the database is written as `my_role() = 'organizer' AND …`. A `BEFORE INSERT` trigger decides the initial status so no user-creation call site can forget it. The app layer (middleware, layouts, `/pending`, `/admin`) only decides what people *see*; RLS is what actually denies.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS + Auth), TypeScript, vitest, postgres.js (RLS suite), Resend, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- Branch is `feature/signup-approval-gate` in the worktree `.claude/worktrees/feature+signup-approval-gate`. Confirm with `git branch --show-current` before every commit. Never commit to `main`.
- Never `git add -A` or `git add .` — stage only the files named in the task.
- All user-facing copy is **French**, matching the existing `/login` and `/signup` pages. Use typographic apostrophes (`’`), not `'`.
- Never log student/parent PII — no emails, names, or submission contents in logs or error messages.
- Expected outcomes are **structured return values**, never thrown errors (prod redacts thrown Server Action messages into an opaque digest). Only throw for genuinely unexpected failures.
- Always HTML-escape user-supplied content in email bodies via the existing `esc()` in `lib/email.ts`.
- Auth preambles come from `lib/auth/require.ts` (`requireUser` / `requireOrganizer` / `requireStudent`). Never hand-roll them. The strings `'Unauthenticated'` and `'Unauthorized'` are load-bearing for tests.
- Any new import of `lib/supabase/admin` must be added to `ALLOWLIST` in `lib/supabase/__tests__/admin-allowlist.test.ts` in the same commit, or that test fails.
- `supabase/migrations/` is single-writer across parallel sessions. Confirm no other session is mid-migration before Task 1.
- Run `pnpm vitest run <file> --exclude '**/.claude/**'` when running a single test file — a bare vitest run sweeps other worktrees' tests.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260725160000_signup_approval_gate.sql` | Schema, trigger, gate, grants, backfill — one transaction |
| `lib/auth/admin.ts` | `isPlatformAdmin(email)` — pure, env-backed |
| `lib/auth/__tests__/admin.test.ts` | Tests for the above |
| `app/pending/page.tsx` | The holding page, copy varies by status |
| `app/__tests__/pending.test.tsx` | Tests for the above |
| `actions/public-schools.ts` | Unauthenticated registry search for `/signup` |
| `actions/__tests__/public-schools.test.ts` | Tests for the above |
| `app/admin/page.tsx` | Review queue, 404 for non-admins |
| `app/admin/actions.ts` | `approveUser` / `rejectUser` server actions (service role) |
| `app/admin/__tests__/actions.test.ts` | Tests for the above |
| `tests/rls/approval-gate.test.ts` | The proof: a pending organizer can touch nothing |

**Modify:**

| Path | Change |
|---|---|
| `types/supabase.ts` | Regenerated from the DB (never hand-edited) |
| `lib/supabase/request.ts` | `Profile` gains `status` |
| `lib/auth/provision.ts` | Intake fields, registry school claim, status read-back |
| `lib/email.ts` | `sendSignupRequestEmail`, `sendSignupFailureEmail` |
| `middleware.ts` | `/pending` early return; status routing on the existing query |
| `app/(organizer)/layout.tsx`, `app/(student)/layout.tsx`, `app/onboarding/page.tsx` | `status !== 'approved' → /pending` |
| `app/onboarding/SchoolCombobox.tsx` | `search` prop so `/signup` can pass the anonymous variant |
| `app/(auth)/signup/page.tsx` | Three new fields |
| `lib/supabase/__tests__/admin-allowlist.test.ts` | Add `app/admin/actions.ts` |
| `tests/rls/seed.ts` | Explicit `status` on personas + a pending organizer persona |
| `.env.example` | `ADMIN_EMAILS` |
| `CLAUDE.md` | Document the gate under Gotchas & Conventions |

---

## Task 1: Migration and the RLS gate

The whole security boundary lands here. Everything after this is UX.

**Files:**
- Create: `supabase/migrations/20260725160000_signup_approval_gate.sql`
- Modify: `tests/rls/seed.ts`
- Test: `tests/rls/approval-gate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `users.status` / `role_description` / `how_found_us` / `reviewed_at` / `notes`; table `signup_allowlist(email, note, created_at)`; `public.set_initial_user_status()` trigger fn; redefined `public.my_role()`. `Fixtures` in `tests/rls/seed.ts` gains `orgPending: string`.

- [ ] **Step 1: Confirm no other session is mid-migration**

```bash
git branch --show-current           # must print feature/signup-approval-gate
ls supabase/migrations | tail -3    # newest should be 20260725122126_revoke_schools_name_grant.sql
```

If a newer file exists that you did not create, stop and report — `supabase/migrations/` is single-writer.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260725160000_signup_approval_gate.sql`:

```sql
-- Manual approval gate for self-registered organizers.
-- Spec: docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md
--
-- Public signup stays open; a new organizer account has zero access until
-- someone flips status to 'approved'. The gate is my_role() below: every
-- organizer-reachable policy in this database is written as
--   my_role() = 'organizer' AND ...
-- so redefining that one function gates ~30 table policies, 5 storage
-- policies and claim_school() at once — and fails CLOSED for any future
-- policy written in the same idiom.
--
-- Everything here is one transaction on purpose: between the my_role()
-- swap and the backfill, every existing organizer is locked out.

-- 1. Columns -----------------------------------------------------------------

alter table public.users
  add column status           text not null default 'pending',
  add column role_description text,
  add column how_found_us     text,
  add column reviewed_at      timestamptz,
  add column notes            text;

alter table public.users
  add constraint users_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Review queue is ordered by created_at desc and filtered by status.
create index users_status_created_at_idx
  on public.users (status, created_at desc);

create table public.signup_allowlist (
  email      text primary key,          -- always stored lowercased
  note       text,
  created_at timestamptz not null default now()
);
alter table public.signup_allowlist enable row level security;
-- Deliberately NO policies and NO grants: service role only. The baseline
-- default privileges from 20260708000001 would otherwise hand anon and
-- authenticated a grant on this table, so revoke explicitly.
revoke all on public.signup_allowlist from anon, authenticated;

-- 2. Initial status, decided in the DB ---------------------------------------
--
-- Four paths insert users rows and only the first should ever be pending:
--   lib/auth/provision.ts      self-signup            -> pending (this gate)
--   actions/join.ts            invited colleague      -> approved
--   actions/invitations.ts     invited student        -> approved
--   tests/rls/seed.ts          fixtures               -> approved
-- Putting this in provisionOrganizer would fix only the first, and a pending
-- STUDENT is a product outage: form_templates -> "students read assigned
-- templates" is my_role() = 'student', so they lose their own forms.

create function public.set_initial_user_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- An explicit value wins. Safe: users has no INSERT policy at all, so RLS
  -- denies every client insert and only the service role reaches this.
  -- tests/rls/seed.ts relies on it to state 'approved' outright.
  if new.status is distinct from 'pending' then
    return new;
  end if;

  if new.role = 'student'
     -- pre-approved tester
     or exists (select 1 from signup_allowlist a where a.email = lower(new.email))
     -- joining a school that is already approved (organizer_invites colleague);
     -- a self-signup cannot match, its school is brand new and has no members
     or exists (select 1 from users u
                 where u.school_id = new.school_id
                   and u.role = 'organizer'
                   and u.status = 'approved')
  then
    new.status := 'approved';
  end if;

  return new;
end $$;

revoke execute on function public.set_initial_user_status() from public, anon, authenticated;

create trigger trg_set_initial_user_status
  before insert on public.users
  for each row execute function public.set_initial_user_status();

-- 3. The gate ----------------------------------------------------------------

create or replace function public.my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from users where id = auth.uid() and status = 'approved'
$$;

-- my_school_id() is deliberately NOT gated. A pending user keeps exactly
-- three capabilities, which is what /pending needs and no more:
--   read own users row, read own schools row, insert feedback.

-- 4. status is not self-writable ---------------------------------------------
--
-- Column grant, following the schools.name precedent (20260725122126), rather
-- than extending guard_user_immutable_fields(): that trigger fires for the
-- service role too, and app/admin/actions.ts must be able to write status.
-- This also clears the latent anon UPDATE grant on users.
--
-- The listed columns are exactly the ones the app updates through an
-- RLS-subject client: full_name (accept-invite, settings), locale (settings),
-- exchange_order (session), plus the two new self-declared intake fields.

revoke update on public.users from authenticated, anon;
grant update (full_name, email, locale, exchange_order,
              role_description, how_found_us)
  on public.users to authenticated;

-- 5. Backfill ----------------------------------------------------------------

update public.users set status = 'approved', reviewed_at = now();

-- The 2026-07-24 unprompted signup: they confirmed their email but
-- provisionOrganizer failed, leaving an auth row with no profile and a broken
-- login. Give them a real pending request so they appear in /admin and see
-- /pending instead. Stub school name matches what provisionOrganizer writes.
insert into public.schools (id, name)
  values ('11111111-2222-3333-4444-555555555555', '');

insert into public.users (id, school_id, role, org_role, full_name, email, status)
  values ('374a7a59-f9de-44a0-a519-c642b9e3b9df',
          '11111111-2222-3333-4444-555555555555',
          'organizer', 'owner', 'Must', 'marvanemust@gmail.com', 'pending');

-- Orphan schools from earlier testing, by explicit id — NOT by a
-- "zero members" predicate, which is order-dependent against the stub above.
delete from public.schools where id in (
  'c015a2be-071f-4ac3-8285-ecac22e68f31',
  'aa666ac1-12cd-48b4-a06e-a86fb41dd4f9',
  '7e7c2f60-bf3a-4e82-90ec-4b0ed1c5886c'
);
```

- [ ] **Step 3: Apply to the local stack**

```bash
supabase db reset
```

Expected: completes without error, replaying all 65 migrations.

If `supabase start` has not been run, run it first. `supabase start` alone does **not** apply new migrations — only `db reset` does.

- [ ] **Step 4: Add the pending persona to the RLS fixtures**

In `tests/rls/seed.ts`, add `orgPending: string` to the `Fixtures` type beside `orgC`:

```ts
  orgC: string; studentC: string; studentSharedA: string; orgPending: string
```

Add it to the id block beside `orgC: id()`:

```ts
    orgC: id(), studentC: id(), studentSharedA: id(), orgPending: id(),
```

Add it to the `authRows` list:

```ts
  const authRows = [
    fx.orgA, fx.orgB, fx.studentA, fx.studentB,
    fx.orgC, fx.studentC, fx.studentSharedA, fx.orgPending,
  ].map((uid) => ({
```

Then add `status: 'approved'` to **every** existing row in the `insert into users` block and append the pending persona. The explicit status is required: the column now defaults to `'pending'`, and `set_initial_user_status()` cannot auto-approve the first organizer of a brand-new school — without this the entire existing matrix fails.

```ts
  await sql`insert into users ${sql([
    { id: fx.orgA, school_id: fx.schoolA, role: 'organizer', org_role: 'owner', full_name: 'Org A', email: `${fx.orgA}@rls.test`, status: 'approved' },
    { id: fx.orgB, school_id: fx.schoolB, role: 'organizer', org_role: 'owner', full_name: 'Org B', email: `${fx.orgB}@rls.test`, status: 'approved' },
    { id: fx.studentA, school_id: fx.schoolA, role: 'student', org_role: 'admin', full_name: 'Étudiant A', email: `${fx.studentA}@rls.test`, status: 'approved' },
    { id: fx.studentB, school_id: fx.schoolB, role: 'student', org_role: 'admin', full_name: 'Étudiant B', email: `${fx.studentB}@rls.test`, status: 'approved' },
    { id: fx.orgC, school_id: fx.schoolC, role: 'organizer', org_role: 'owner', full_name: 'Org C', email: `${fx.orgC}@rls.test`, status: 'approved' },
    { id: fx.studentC, school_id: fx.schoolC, role: 'student', org_role: 'admin', full_name: 'Étudiant C', email: `${fx.studentC}@rls.test`, status: 'approved' },
    { id: fx.studentSharedA, school_id: fx.schoolA, role: 'student', org_role: 'admin', full_name: 'Étudiant partagé A', email: `${fx.studentSharedA}@rls.test`, status: 'approved' },
    // Same school as orgA, same role, same everything — the ONLY difference is
    // status. Every denial asserted for this persona is therefore attributable
    // to the gate and nothing else.
    { id: fx.orgPending, school_id: fx.schoolA, role: 'organizer', org_role: 'admin', full_name: 'Org en attente', email: `${fx.orgPending}@rls.test`, status: 'pending' },
  ])}`
```

- [ ] **Step 5: Write the failing gate test**

Create `tests/rls/approval-gate.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type postgres from 'postgres'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

beforeAll(async () => { fx = await seedFixtures(sql) })
afterAll(async () => {
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

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

// orgPending is an organizer OF SCHOOL A with status='pending'. orgA is the
// same role in the same school, approved. Anything orgPending is denied that
// orgA is allowed is attributable to the gate alone.
describe('approval gate: a pending organizer is denied everything', () => {
  it('my_role() returns null', async () => {
    const [row] = await runAs(sql, fx.orgPending, (tx) => tx`select my_role() as role`)
    expect(row.role).toBeNull()
  })

  it('my_role() returns the role for an approved organizer', async () => {
    const [row] = await runAs(sql, fx.orgA, (tx) => tx`select my_role() as role`)
    expect(row.role).toBe('organizer')
  })

  it('users: cannot read other members of their own school', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from users where id = ${fx.studentA}`)).toHaveLength(0)
  })

  it('exchanges: cannot read their own school exchange', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from exchanges where id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchanges: cannot create one', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`insert into exchanges (name, year, school_a_id) values ('Interdit', 2026, ${fx.schoolA})`))
  })

  it('form_templates: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from form_templates where id = ${fx.templateA}`)).toHaveLength(0)
  })

  it('form_templates: cannot create', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`insert into form_templates (exchange_id, school_id, name, type, kind, status, audience, created_by)
         values (${fx.exchangeA}, ${fx.schoolA}, 'Interdit', 'data_entry', 'online', 'active', 'all', ${fx.orgPending})`))
  })

  it('assignments: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from assignments where id = ${fx.assignmentA}`)).toHaveLength(0)
  })

  it('submissions: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from submissions where id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('submissions: cannot approve one', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`update submissions set status = 'approved' where id = ${fx.submissionA}`))
  })

  it('field_answers: cannot read student answers', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from field_answers where id = ${fx.answerA}`)).toHaveLength(0)
  })

  it('document_uploads: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from document_uploads where submission_id = ${fx.submissionA}`)).toHaveLength(0)
  })

  it('applications: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from applications where id = ${fx.applicationA}`)).toHaveLength(0)
  })

  it('exchange_enrollments: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select user_id from exchange_enrollments where exchange_id = ${fx.exchangeA}`)).toHaveLength(0)
  })

  it('exchange_info_cards: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from exchange_info_cards where id = ${fx.infoCardA}`)).toHaveLength(0)
  })

  it('audit_log: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from audit_log where actor_school_id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('email_send_log: cannot read', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from email_send_log where school_id = ${fx.schoolA}`)).toHaveLength(0)
  })

  it('storage: cannot read school document objects', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select name from storage.objects where bucket_id = 'documents' and name = ${fx.docPathA}`)).toHaveLength(0)
  })

  it('storage: cannot read school template objects', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select name from storage.objects where bucket_id = 'form-templates' and name = ${fx.tplPathA}`)).toHaveLength(0)
  })

  it('claim_school: cannot name the school', async () => {
    const [row] = await runAs(sql, fx.orgPending, (tx) =>
      tx`select claim_school('FR', '0690123X', 'Lycée Test') as name`)
    expect(row.name).toBeNull()
  })
})

describe('approval gate: what a pending organizer keeps', () => {
  it('can read their own users row', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from users where id = ${fx.orgPending}`)).toHaveLength(1)
  })

  it('can read their own school row', async () => {
    expect(await readRows(fx.orgPending, (tx) =>
      tx`select id from schools where id = ${fx.schoolA}`)).toHaveLength(1)
  })

  it('can update their own full_name', async () => {
    const outcome = await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`update users set full_name = 'Nouveau nom' where id = ${fx.orgPending}`)
    expect(outcome).toBe(1)
  })
})

describe('approval gate: status is not self-writable', () => {
  it('a pending organizer cannot approve themselves', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgPending, (tx) =>
      tx`update users set status = 'approved' where id = ${fx.orgPending}`))
  })

  it('an approved organizer cannot write notes on their own row', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set notes = 'pwned' where id = ${fx.orgA}`))
  })

  it('an approved organizer cannot write reviewed_at', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update users set reviewed_at = now() where id = ${fx.orgA}`))
  })
})

// Non-vacuousness: prove the denials above come from the gate, not from a
// typo'd fixture or a table that denies everyone. Approving the persona inside
// a rolled-back transaction must make access appear.
describe('approval gate: denials are non-vacuous', () => {
  it('approving the pending organizer grants exchange reads', async () => {
    const rows = await runAs(sql, null, async () => {
      return await sql.begin(async (tx) => {
        await tx`update users set status = 'approved' where id = ${fx.orgPending}`
        const claims = JSON.stringify({ sub: fx.orgPending, role: 'authenticated' })
        await tx`select set_config('request.jwt.claims', ${claims}, true)`
        await tx.unsafe('set local role authenticated')
        const out = await tx`select id from exchanges where id = ${fx.exchangeA}`
        await tx.unsafe('reset role')
        throw Object.assign(new Error('rollback'), { rows: out })
      }).catch((e) => (e as { rows?: postgres.Row[] }).rows ?? [])
    })
    expect(rows).toHaveLength(1)
  })
})

describe('set_initial_user_status', () => {
  it('defaults a fresh self-signup organizer to pending', async () => {
    const school = await sql`insert into schools (name) values ('') returning id`
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (gen_random_uuid(), ${school[0].id}, 'organizer', 'owner', 'Solo', ${'solo-' + fx.suffix + '@rls.test'})
      returning status`
    expect(row.status).toBe('pending')
    await sql`delete from schools where id = ${school[0].id}`
  })

  it('auto-approves an invited student', async () => {
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (gen_random_uuid(), ${fx.schoolA}, 'student', 'admin', '', ${'stud-' + fx.suffix + '@rls.test'})
      returning id, status`
    expect(row.status).toBe('approved')
    await sql`delete from users where id = ${row.id}`
  })

  it('auto-approves a colleague joining an already-approved school', async () => {
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (gen_random_uuid(), ${fx.schoolA}, 'organizer', 'admin', 'Collègue', ${'colleague-' + fx.suffix + '@rls.test'})
      returning id, status`
    expect(row.status).toBe('approved')
    await sql`delete from users where id = ${row.id}`
  })

  it('auto-approves an allowlisted self-signup, case-insensitively', async () => {
    const email = `Tester-${fx.suffix}@RLS.test`
    await sql`insert into signup_allowlist (email, note) values (${email.toLowerCase()}, 'plan test')`
    const school = await sql`insert into schools (name) values ('') returning id`
    const [row] = await sql`
      insert into users (id, school_id, role, org_role, full_name, email)
      values (gen_random_uuid(), ${school[0].id}, 'organizer', 'owner', 'Tester', ${email})
      returning status`
    expect(row.status).toBe('approved')
    await sql`delete from schools where id = ${school[0].id}`
    await sql`delete from signup_allowlist where email = ${email.toLowerCase()}`
  })
})
```

Note `tplPathA` is already in `Fixtures` and populated by the seed; no change needed for it.

- [ ] **Step 6: Run the gate test — expect failures before the migration is verified**

```bash
pnpm vitest run --config vitest.rls.config.ts tests/rls/approval-gate.test.ts
```

Expected: PASS, since Step 3 already applied the migration. If any denial test fails, the gate has a hole — stop and report which table.

- [ ] **Step 7: Run the full RLS suite to prove nothing regressed**

```bash
pnpm test:rls
```

Expected: all suites pass, including the pre-existing ~161 matrix cases. A failure here almost certainly means a `status: 'approved'` was missed in `tests/rls/seed.ts` Step 4.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add supabase/migrations/20260725160000_signup_approval_gate.sql tests/rls/seed.ts tests/rls/approval-gate.test.ts
git commit -m "feat(auth): approval gate in RLS via my_role()"
```

---

## Task 2: Types and the Profile status field

**Files:**
- Modify: `types/supabase.ts` (regenerated), `lib/supabase/request.ts`

**Interfaces:**
- Consumes: `users.status` from Task 1.
- Produces: `Profile.status: 'pending' | 'approved' | 'rejected'`, read by every layout, middleware, and `/pending`.

- [ ] **Step 1: Regenerate the database types**

Use the Supabase MCP `generate_typescript_types` tool and overwrite `types/supabase.ts` **verbatim**. Never hand-edit that file — `types/db.ts` narrows the generated rows, so schema drift fails compile there instead.

- [ ] **Step 2: Add status to Profile**

In `lib/supabase/request.ts`, add to the `Profile` type after `org_role`:

```ts
  org_role: string | null
  // Manual approval gate. RLS is the real boundary (my_role() returns null
  // unless this is 'approved'); the layouts read this only to decide whether
  // to show the app or /pending.
  status: 'pending' | 'approved' | 'rejected'
```

And add it to the select in `getProfile`:

```ts
    .select('id, role, school_id, full_name, email, org_role, status, locale, exchange_order, schools(name, country, subscription_status, plan, grace_until)')
```

- [ ] **Step 3: Verify the types compile**

```bash
npx tsc --noEmit
```

Expected: no errors. Ignore any LSP diagnostics claiming `Cannot find name 'Promise'` — fresh worktrees emit bogus TS errors; `tsc --noEmit` is the authority.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add types/supabase.ts lib/supabase/request.ts
git commit -m "feat(auth): expose users.status on Profile"
```

---

## Task 3: The /pending page and the redirect gates

**Files:**
- Create: `app/pending/page.tsx`, `app/__tests__/pending.test.tsx`
- Modify: `middleware.ts`, `app/(organizer)/layout.tsx`, `app/(student)/layout.tsx`, `app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `Profile.status` from Task 2.
- Produces: the route `/pending`. Nothing imports from it.

- [ ] **Step 1: Write the failing page test**

Create `app/__tests__/pending.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getProfile = vi.fn()
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })

vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

import PendingPage from '../pending/page'

beforeEach(() => {
  getProfile.mockReset()
  redirect.mockClear()
})

describe('/pending', () => {
  it('tells a pending organizer their request is under review', async () => {
    getProfile.mockResolvedValue({ status: 'pending', role: 'organizer' })
    render(await PendingPage())
    expect(screen.getByText(/en cours d’examen/i)).toBeInTheDocument()
  })

  it('tells a rejected organizer plainly, with a contact address', async () => {
    getProfile.mockResolvedValue({ status: 'rejected', role: 'organizer' })
    render(await PendingPage())
    expect(screen.queryByText(/en cours d’examen/i)).not.toBeInTheDocument()
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
  })

  it('sends an approved organizer to the app', async () => {
    getProfile.mockResolvedValue({ status: 'approved', role: 'organizer' })
    await expect(PendingPage()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('sends an approved student to their forms', async () => {
    getProfile.mockResolvedValue({ status: 'approved', role: 'student' })
    await expect(PendingPage()).rejects.toThrow('REDIRECT:/my-forms')
  })

  it('sends a session with no profile to login', async () => {
    getProfile.mockResolvedValue(null)
    await expect(PendingPage()).rejects.toThrow('REDIRECT:/login')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm vitest run app/__tests__/pending.test.tsx --exclude '**/.claude/**'
```

Expected: FAIL — cannot resolve `../pending/page`.

- [ ] **Step 3: Write the page**

Create `app/pending/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/request'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'

const SUPPORT_EMAIL = 'contact@eazyexchange.com'

// Terminal page for an account that is not approved. Deliberately NOT in
// middleware's isAuthRoute list: that branch redirects a non-approved user to
// /pending, so including this route would redirect /pending to itself — an
// infinite loop and a blank tab, the failure shell-destination.ts documents.
// An approved visitor is sent onward from here instead.
export default async function PendingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')
  if (profile.status === 'approved') {
    redirect(profile.role === 'organizer' ? '/dashboard' : '/my-forms')
  }

  const rejected = profile.status === 'rejected'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={460} className="flex flex-col gap-4">
        <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          {rejected ? 'Accès non ouvert' : 'Votre demande est en cours d’examen'}
        </h3>
        {rejected ? (
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Nous ne pouvons pas ouvrir l’accès à votre compte pour le moment. Si vous
            pensez qu’il s’agit d’une erreur, écrivez-nous à{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        ) : (
          <>
            <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
              Merci d’avoir créé votre compte. Eazyexchange n’est pas encore ouvert à
              tous : nous examinons chaque demande une par une et nous revenons vers
              vous très vite.
            </p>
            <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
              Une question d’ici là ?{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </>
        )}
      </AuthCard>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm vitest run app/__tests__/pending.test.tsx --exclude '**/.claude/**'
```

Expected: 5 passing.

- [ ] **Step 5: Add the middleware early return and status routing**

In `middleware.ts`, immediately after the existing `/auth` early return, add:

```ts
  // Terminal for a non-approved account. NOT in isAuthRoute below — that branch
  // redirects non-approved users to /pending, which would loop onto itself.
  if (pathname === '/pending') {
    return supabaseResponse
  }
```

Then in the logged-in branch, extend the existing `users` select — it already runs on these routes, so `status` rides along free — and route non-approved users:

```ts
    const { data: profile } = await supabase
      .from('users').select('role, full_name, status').eq('id', user.id)
      .single<{ role: string; full_name: string | null; status: string }>()
```

and immediately after the existing `if (!profile) { return supabaseResponse }` block:

```ts
    // Not approved: /pending is the only page they get. Checked before the
    // accept-invite and role-destination branches below, which would otherwise
    // hand them a shell the layout has to bounce again.
    if (profile.status !== 'approved') {
      return NextResponse.redirect(new URL('/pending', request.url))
    }
```

- [ ] **Step 6: Add the layout gates**

In `app/(organizer)/layout.tsx`, immediately after the existing `if (!profile || profile.role !== 'organizer')` block:

```ts
  // RLS already denies everything for a non-approved account; this only stops
  // the shell rendering an empty, broken dashboard on the way.
  if (profile.status !== 'approved') redirect('/pending')
```

Add the identical two lines to `app/(student)/layout.tsx` after its equivalent role check, and to `app/onboarding/page.tsx` after its `profile.role !== 'organizer'` check. In `onboarding/page.tsx` the check must sit **above** the `schoolName` read, so a pending organizer never reaches the exchange-count query.

- [ ] **Step 7: Verify nothing regressed**

```bash
pnpm vitest run middleware app/\(organizer\) app/\(student\) app/onboarding --exclude '**/.claude/**'
npx tsc --noEmit
```

Expected: pass. If a middleware test asserts the exact shape of the `users` select, update it to include `status`.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add app/pending/page.tsx app/__tests__/pending.test.tsx middleware.ts "app/(organizer)/layout.tsx" "app/(student)/layout.tsx" app/onboarding/page.tsx
git commit -m "feat(auth): /pending page and non-approved redirects"
```

---

## Task 4: Provisioning — intake fields, registry school, status read-back

**Files:**
- Modify: `lib/auth/provision.ts`, `app/(auth)/signup/actions.ts`, `app/auth/confirm/route.ts`
- Test: `lib/auth/__tests__/provision.test.ts` (extend if it exists, create if not)

**Interfaces:**
- Consumes: `set_initial_user_status()` from Task 1.
- Produces: `provisionOrganizer(user)` now returns `{ ok: true; status: 'pending' | 'approved' } | { ok: false; reason: string }`. Callers branch on `status` to choose `/pending` vs `/onboarding`.

- [ ] **Step 1: Write the failing test**

Create or extend `lib/auth/__tests__/provision.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const from = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/lib/email', () => ({
  sendSignupRequestEmail: vi.fn(), sendSignupFailureEmail: vi.fn(),
}))

import { provisionOrganizer } from '../provision'

// Minimal chainable stub of the two tables provisionOrganizer touches.
function mockTables(opts: {
  existing?: { id: string } | null
  registry?: { uai: string; name: string; postal_code: string; commune: string } | null
  insertedStatus?: 'pending' | 'approved'
}) {
  from.mockReset()
  from.mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.existing ?? null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({
          data: { status: opts.insertedStatus ?? 'pending' }, error: null,
        }) }) }),
      }
    }
    if (table === 'school_registry') {
      return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({
        maybeSingle: async () => ({ data: opts.registry ?? null }),
      }) }) }) }) }) }
    }
    if (table === 'schools') {
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'school-1' }, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

beforeEach(() => vi.clearAllMocks())

describe('provisionOrganizer', () => {
  it('reports the pending status the database assigned', async () => {
    mockTables({ insertedStatus: 'pending', registry: { uai: '0690123X', name: 'Lycée Jean Moulin', postal_code: '69003', commune: 'Lyon' } })
    const res = await provisionOrganizer({
      id: 'u1', email: 'M.Dupont@ac-lyon.fr',
      user_metadata: { full_name: 'Marie Dupont', school_uai: '0690123X', school_name: 'Lycée Jean Moulin', school_country: 'FR', role_description: 'Professeure', how_found_us: 'Recommandation' },
    })
    expect(res).toEqual({ ok: true, status: 'pending' })
  })

  it('reports approved for an allowlisted address', async () => {
    mockTables({ insertedStatus: 'approved', registry: { uai: '0690123X', name: 'Lycée Jean Moulin', postal_code: '69003', commune: 'Lyon' } })
    const res = await provisionOrganizer({
      id: 'u2', email: 'tester@example.com',
      user_metadata: { full_name: 'Tester', school_uai: '0690123X', school_name: 'Lycée Jean Moulin', school_country: 'FR' },
    })
    expect(res).toEqual({ ok: true, status: 'approved' })
  })

  it('is idempotent when the profile already exists', async () => {
    mockTables({ existing: { id: 'u3' } })
    const res = await provisionOrganizer({ id: 'u3', email: 'a@b.fr', user_metadata: { full_name: 'A' } })
    expect(res).toEqual({ ok: true, status: 'approved' })
  })

  it('refuses a UAI the registry does not carry', async () => {
    mockTables({ registry: null })
    const res = await provisionOrganizer({
      id: 'u4', email: 'a@b.fr',
      user_metadata: { full_name: 'A', school_uai: 'FAKE9999', school_name: 'École Inventée', school_country: 'FR' },
    })
    expect(res).toEqual({ ok: false, reason: 'unknown_school' })
  })

  it('still provisions when no school was picked (Google path)', async () => {
    mockTables({ insertedStatus: 'pending' })
    const res = await provisionOrganizer({ id: 'u5', email: 'a@b.fr', user_metadata: { full_name: 'A' } })
    expect(res).toEqual({ ok: true, status: 'pending' })
  })

  it('rejects missing metadata', async () => {
    mockTables({})
    const res = await provisionOrganizer({ id: 'u6', email: '', user_metadata: {} })
    expect(res).toEqual({ ok: false, reason: 'missing_metadata' })
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm vitest run lib/auth/__tests__/provision.test.ts --exclude '**/.claude/**'
```

Expected: FAIL — the result shape has no `status`.

- [ ] **Step 3: Rewrite provision.ts**

Replace the body of `lib/auth/provision.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSignupRequestEmail, sendSignupFailureEmail } from '@/lib/email'

export interface ProvisionUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}

export type ProvisionResult =
  | { ok: true; status: 'pending' | 'approved' }
  | { ok: false; reason: string }

function metaString(meta: Record<string, unknown> | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' ? v.trim() : ''
}

// Shared account-creation core. Idempotent; rolls back the school if the
// profile insert fails so a partial failure leaves no debris.
//
// The initial status is NOT decided here — set_initial_user_status() decides
// it in the database so that join.ts, invitations.ts and the RLS fixtures are
// covered by the same rule. We read it back to pick the redirect.
async function createOrganizerAccount(
  user: ProvisionUser,
  fullName: string,
  school: { name: string; uai: string | null; country: string },
): Promise<ProvisionResult> {
  const email = (user.email ?? '').trim().toLowerCase()
  if (!fullName || !email) return { ok: false, reason: 'missing_metadata' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('users').select('id').eq('id', user.id).maybeSingle()
  if (existing) return { ok: true, status: 'approved' }

  const { data: created, error: schoolError } = await admin
    .from('schools')
    .insert({ name: school.name, uai: school.uai, country: school.country })
    .select('id').single()
  if (schoolError || !created) return { ok: false, reason: 'school_insert_failed' }

  const { data: profile, error: profileError } = await admin.from('users').insert({
    id: user.id,
    school_id: created.id,
    role: 'organizer' as const,
    org_role: 'owner' as const,
    full_name: fullName,
    email,
    role_description: metaString(user.user_metadata, 'role_description') || null,
    how_found_us: metaString(user.user_metadata, 'how_found_us') || null,
  }).select('status').single()

  if (profileError || !profile) {
    await admin.from('schools').delete().eq('id', created.id)
    return { ok: false, reason: 'profile_insert_failed' }
  }

  const status = profile.status as 'pending' | 'approved'
  if (status === 'pending') {
    // Fire-and-forget: a notification failure must never fail the signup.
    void sendSignupRequestEmail({
      fullName,
      email,
      schoolLabel: school.name || '—',
      roleDescription: metaString(user.user_metadata, 'role_description') || '—',
      howFoundUs: metaString(user.user_metadata, 'how_found_us') || '—',
      viaGoogle: !school.uai && !school.name,
    })
  }

  return { ok: true, status }
}

// Resolve the school the signup form picked, re-validating it against the
// registry rather than trusting the client — same precedence claim_school()
// uses: exact (uai, name) pair first, then the lowest id for that UAI.
// Returns null when nothing was picked (the Google path), which provisions a
// blank school so /onboarding step 1 can capture it after approval.
async function resolveSchool(
  meta: Record<string, unknown> | undefined,
): Promise<{ name: string; uai: string | null; country: string } | null | 'unknown'> {
  const uai = metaString(meta, 'school_uai')
  const country = metaString(meta, 'school_country') || 'FR'
  if (!uai) return null

  const admin = createAdminClient()
  const pickedName = metaString(meta, 'school_name')
  const exact = await admin
    .from('school_registry').select('uai, name')
    .eq('uai', uai).eq('name', pickedName)
    .order('id').limit(1).maybeSingle()
  if (exact.data) return { name: exact.data.name, uai: exact.data.uai, country }

  const byUai = await admin
    .from('school_registry').select('uai, name')
    .eq('uai', uai)
    .order('id').limit(1).maybeSingle()
  if (byUai.data) return { name: byUai.data.name, uai: byUai.data.uai, country }

  return 'unknown'
}

// Email/password signup: full name and the picked school come from signup
// metadata. The school is claimed here (service role) rather than at
// /onboarding, because a pending organizer cannot reach /onboarding at all.
export async function provisionOrganizer(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName = metaString(user.user_metadata, 'full_name')
  const school = await resolveSchool(user.user_metadata)
  if (school === 'unknown') return { ok: false, reason: 'unknown_school' }
  return createOrganizerAccount(user, fullName, school ?? { name: '', uai: null, country: 'FR' })
}

// Google signup: the identity carries only a name, so the school is deferred
// to /onboarding step 1 as before.
export async function provisionOrganizerFromOAuth(user: ProvisionUser): Promise<ProvisionResult> {
  const fullName =
    metaString(user.user_metadata, 'full_name') || metaString(user.user_metadata, 'name')
  return createOrganizerAccount(user, fullName, { name: '', uai: null, country: 'FR' })
}
```

- [ ] **Step 4: Update the two callers**

In `app/(auth)/signup/actions.ts`, replace the provision block in `confirmSignupCode`:

```ts
  const result = await provisionOrganizer(data.user)
  if (!result.ok) return { ok: false, error: 'provision_failed' }
  redirect(result.status === 'approved' ? '/onboarding' : '/pending')
```

In `app/auth/confirm/route.ts`, replace the `type === 'signup'` block:

```ts
      if (type === 'signup') {
        if (!data.user) return redirect('/login?error=signup_failed')
        const result = await provisionOrganizer(data.user)
        if (!result.ok) return redirect('/login?error=signup_failed')
        if (result.status === 'pending') return redirect('/pending')
      }
```

`app/auth/callback/route.ts` (Google) needs no change: it already redirects to `next`, and middleware bounces a pending user from there to `/pending`.

- [ ] **Step 5: Run the tests**

```bash
pnpm vitest run lib/auth "app/(auth)/signup" app/auth --exclude '**/.claude/**'
npx tsc --noEmit
```

Expected: pass. Existing tests asserting `{ ok: true }` need updating to `{ ok: true, status: … }`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add lib/auth/provision.ts lib/auth/__tests__/provision.test.ts "app/(auth)/signup/actions.ts" app/auth/confirm/route.ts
git commit -m "feat(auth): provision with intake fields and registry-claimed school"
```

---

## Task 5: Signup notification emails

**Files:**
- Modify: `lib/email.ts`
- Test: `lib/__tests__/email-signup.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sendSignupRequestEmail(opts: { fullName, email, schoolLabel, roleDescription, howFoundUs, viaGoogle })` and `sendSignupFailureEmail(opts: { email, reason })`, both `Promise<void>`, both used by Task 4.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/email-signup.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn(async () => ({ error: null }))
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))
vi.mock('@/lib/email-log', () => ({ logEmailSend: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  sendMock.mockClear()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.ADMIN_EMAILS = 'owner@example.com'
})

describe('sendSignupRequestEmail', () => {
  it('sends the request details to ADMIN_EMAILS', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: 'Marie Dupont', email: 'm.dupont@ac-lyon.fr',
      schoolLabel: 'Lycée Jean Moulin', roleDescription: 'Professeure',
      howFoundUs: 'Recommandation', viaGoogle: false,
    })
    const call = sendMock.mock.calls[0][0] as { to: string[]; html: string }
    expect(call.to).toEqual(['owner@example.com'])
    expect(call.html).toContain('Lycée Jean Moulin')
    expect(call.html).toContain('/admin')
  })

  it('escapes HTML in the applicant-supplied fields', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: '<script>alert(1)</script>', email: 'x@y.fr',
      schoolLabel: 'A', roleDescription: 'B', howFoundUs: 'C', viaGoogle: false,
    })
    const call = sendMock.mock.calls[0][0] as { html: string }
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('marks a Google signup as having no details', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: 'G User', email: 'g@y.fr',
      schoolLabel: '—', roleDescription: '—', howFoundUs: '—', viaGoogle: true,
    })
    const call = sendMock.mock.calls[0][0] as { html: string }
    expect(call.html).toContain('via Google')
  })

  it('does nothing when ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: 'A', email: 'a@b.fr', schoolLabel: '—',
      roleDescription: '—', howFoundUs: '—', viaGoogle: false,
    })
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('sendSignupFailureEmail', () => {
  it('reports a failed provision without leaking the reason to the user', async () => {
    const { sendSignupFailureEmail } = await import('../email')
    await sendSignupFailureEmail({ email: 'm.dupont@ac-lyon.fr', reason: 'school_insert_failed' })
    const call = sendMock.mock.calls[0][0] as { subject: string; html: string }
    expect(call.subject).toMatch(/échec/i)
    expect(call.html).toContain('school_insert_failed')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm vitest run lib/__tests__/email-signup.test.ts --exclude '**/.claude/**'
```

Expected: FAIL — `sendSignupRequestEmail` is not exported.

- [ ] **Step 3: Add both senders**

Append to `lib/email.ts`, after `sendUnverifiedSchoolEmail`:

```ts
const ADMIN_FOOTER = 'Notification interne Eazyexchange.'

// Recipients for owner-facing alerts. Deliberately ADMIN_EMAILS and not
// FEEDBACK_EMAIL: FEEDBACK_EMAIL is optional by design and is not confirmed
// set in Vercel prod, which would drop signup alerts silently. ADMIN_EMAILS
// is the same variable /admin gates on, so it cannot be missing in practice.
function adminRecipients(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

// A new organizer has signed up and is waiting for manual approval.
export async function sendSignupRequestEmail(opts: {
  fullName: string
  email: string
  schoolLabel: string
  roleDescription: string
  howFoundUs: string
  viaGoogle: boolean
}): Promise<void> {
  const to = adminRecipients()
  if (to.length === 0) return

  const note = opts.viaGoogle
    ? `<p style="font-size:13px;color:#5C7268;">Inscription via Google — aucun détail fourni.</p>`
    : ''
  const html = layout(`
    <p><strong>Nouvelle demande d’accès</strong></p>
    ${note}
    <p style="font-size:14px;">
      <strong>${esc(opts.fullName)}</strong><br>
      ${esc(opts.email)}<br>
      ${esc(opts.schoolLabel)}<br>
      <span style="color:#5C7268;">Rôle : ${esc(opts.roleDescription)}</span><br>
      <span style="color:#5C7268;">Nous a connus par : ${esc(opts.howFoundUs)}</span>
    </p>
    <p><a href="${APP_URL}/admin" style="display:inline-block;background:#2456E6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">Examiner la demande</a></p>
  `, ADMIN_FOOTER)
  await send(to, `Nouvelle demande d’accès — ${opts.schoolLabel}`, html, 'signup request email')
}

// Provisioning failed after the user confirmed their email: no users row, no
// /admin entry, nothing. This is exactly how the 2026-07-24 signup was nearly
// missed — and a Database Webhook on users INSERT would have the same blind
// spot, since there is no row to fire on.
export async function sendSignupFailureEmail(opts: {
  email: string
  reason: string
}): Promise<void> {
  const to = adminRecipients()
  if (to.length === 0) return

  const html = layout(`
    <p><strong>Échec de création de compte</strong></p>
    <p style="font-size:14px;">
      ${esc(opts.email)} a confirmé son e-mail mais le provisionnement a échoué.<br>
      <span style="color:#5C7268;">Raison : ${esc(opts.reason)}</span>
    </p>
    <p style="font-size:13px;color:#5C7268;">
      Aucune ligne n’a été créée dans users : cette personne n’apparaît pas dans /admin.
    </p>
  `, ADMIN_FOOTER)
  await send(to, 'Échec de création de compte Eazyexchange', html, 'signup failure email')
}
```

- [ ] **Step 4: Wire the failure path**

In `lib/auth/provision.ts`, in `createOrganizerAccount`, replace both failure returns so they notify first:

```ts
  if (schoolError || !created) {
    void sendSignupFailureEmail({ email, reason: 'school_insert_failed' })
    return { ok: false, reason: 'school_insert_failed' }
  }
```

```ts
  if (profileError || !profile) {
    await admin.from('schools').delete().eq('id', created.id)
    void sendSignupFailureEmail({ email, reason: 'profile_insert_failed' })
    return { ok: false, reason: 'profile_insert_failed' }
  }
```

- [ ] **Step 5: Run the tests**

```bash
pnpm vitest run lib/__tests__/email-signup.test.ts lib/auth --exclude '**/.claude/**'
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add lib/email.ts lib/__tests__/email-signup.test.ts lib/auth/provision.ts
git commit -m "feat(email): notify on signup request and on failed provisioning"
```

---

## Task 6: Anonymous registry search and the signup form fields

**Files:**
- Create: `actions/public-schools.ts`, `actions/__tests__/public-schools.test.ts`
- Modify: `app/onboarding/SchoolCombobox.tsx`, `app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `searchPublicSchools(query: string): Promise<SchoolOption[]>`. `SchoolCombobox` gains an optional prop `search?: (q: string) => Promise<SchoolOption[]>`, defaulting to the authenticated `searchSchools`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/public-schools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const like = vi.fn()
const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

import { searchPublicSchools } from '../public-schools'

function stubRows(rows: unknown[]) {
  createClient.mockResolvedValue({
    from: () => ({ select: () => ({ like: (...args: unknown[]) => {
      like(...args)
      return { order: () => ({ limit: async () => ({ data: rows, error: null }) }) }
    } }) }),
  })
}

beforeEach(() => { like.mockClear(); createClient.mockReset() })

describe('searchPublicSchools', () => {
  it('returns nothing for a query shorter than the minimum', async () => {
    stubRows([])
    expect(await searchPublicSchools('a')).toEqual([])
    expect(like).not.toHaveBeenCalled()
  })

  it('normalizes accents and punctuation before querying', async () => {
    stubRows([])
    await searchPublicSchools('Saint-Ouen')
    expect(like).toHaveBeenCalledWith('search_name', 'saint ouen%')
  })

  it('cannot receive LIKE wildcards from user input', async () => {
    stubRows([])
    await searchPublicSchools('100%_test')
    expect(like).toHaveBeenCalledWith('search_name', '100 test%')
  })

  it('ranks prefix matches ahead of contains matches and dedupes', async () => {
    const a = { id: 1, uai: 'A', name: 'Alpha', type: 'LYC', status: null, commune: 'Lyon', postal_code: '69003' }
    const b = { id: 2, uai: 'B', name: 'Beta', type: 'LYC', status: null, commune: 'Lyon', postal_code: '69003' }
    createClient.mockResolvedValue({
      from: () => ({ select: () => ({ like: (col: string) => ({
        order: () => ({ limit: async () => ({ data: col === 'search_name' ? [a] : [b, a], error: null }) }),
      }) }) }),
    })
    const out = await searchPublicSchools('alp')
    expect(out.map((o) => o.id)).toEqual([1, 2])
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm vitest run actions/__tests__/public-schools.test.ts --exclude '**/.claude/**'
```

Expected: FAIL — cannot resolve `../public-schools`.

- [ ] **Step 3: Write the action**

Create `actions/public-schools.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeText, isSearchable, rankSchoolOptions, MAX_RESULTS,
  type SchoolOption,
} from '@/lib/schools/registry'

const REGISTRY_COLUMNS = 'id, uai, name, type, status, commune, postal_code'

// Unauthenticated twin of searchSchools (actions/onboarding.ts) for the signup
// form, which runs before any account exists. Safe to expose: school_registry
// is open government data with a public SELECT policy, already downloadable
// from data.gouv.fr, and it carries no PII.
//
// No rate limiter, deliberately, for the reason already recorded on
// searchSchools: lib/rate-limit fails CLOSED, so a limiter outage would block
// signup entirely — strictly worse than scraping a public dataset.
//
// normalizeText leaves only [a-z0-9 ], so the query can never carry a %, _, *
// or backslash into the LIKE pattern.
export async function searchPublicSchools(query: string): Promise<SchoolOption[]> {
  const q = normalizeText(query ?? '')
  if (!isSearchable(q)) return []

  const supabase = await createClient()
  const run = async (column: 'search_name' | 'search_text', pattern: string) => {
    const { data, error } = await supabase
      .from('school_registry')
      .select(REGISTRY_COLUMNS)
      .like(column, pattern)
      .order('name')
      .limit(MAX_RESULTS)
    if (error) throw error
    return (data ?? []) as SchoolOption[]
  }

  const prefixHits = await run('search_name', `${q}%`)
  const containsHits = await run('search_text', `%${q}%`)
  return rankSchoolOptions(prefixHits, containsHits)
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm vitest run actions/__tests__/public-schools.test.ts --exclude '**/.claude/**'
```

Expected: 4 passing.

- [ ] **Step 5: Make SchoolCombobox accept a search function**

In `app/onboarding/SchoolCombobox.tsx`, change the signature and the one call site:

```tsx
export function SchoolCombobox({ value, onSelect, search = searchSchools }: {
  value: SchoolOption | null
  onSelect: (option: SchoolOption | null) => void
  // /signup runs before any account exists, so it passes the unauthenticated
  // twin. Defaults to the organizer-gated one used by /onboarding.
  search?: (query: string) => Promise<SchoolOption[]>
}) {
```

and inside the debounced effect, replace `searchSchools(query)` with `search(query)`. Add `search` to that effect's dependency array.

- [ ] **Step 6: Add the fields to the signup form**

In `app/(auth)/signup/page.tsx`:

Add imports:

```tsx
import { SchoolCombobox } from '@/app/onboarding/SchoolCombobox'
import { searchPublicSchools } from '@/actions/public-schools'
import type { SchoolOption } from '@/lib/schools/registry'
```

Add state beside `fullName`:

```tsx
  const [school, setSchool] = useState<SchoolOption | null>(null)
  const [roleDescription, setRoleDescription] = useState('')
  const [howFoundUs, setHowFoundUs] = useState('')
```

Extend the validation and the `signUp` call in `handleSignup`:

```tsx
    if (!name) { setError('Veuillez remplir tous les champs.'); return }
    if (!school) { setError('Veuillez sélectionner votre établissement.'); return }
    if (!roleDescription.trim()) { setError('Veuillez indiquer votre rôle.'); return }
    if (!howFoundUs.trim()) { setError('Dites-nous comment vous nous avez connus.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: name,
          school_uai: school.uai,
          school_name: school.name,
          school_country: 'FR',
          role_description: roleDescription.trim(),
          how_found_us: howFoundUs.trim(),
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
      },
    })
```

Add the three fields to the form, between the "Nom complet" and "E-mail" blocks:

```tsx
            <SchoolCombobox value={school} onSelect={setSchool} search={searchPublicSchools} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="roleDescription" className="text-[13px] font-semibold text-[#42506E]">Votre rôle</Label>
              <Input id="roleDescription" value={roleDescription} onChange={e => setRoleDescription(e.target.value)} required placeholder="Professeure d’allemand" className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="howFoundUs" className="text-[13px] font-semibold text-[#42506E]">Comment nous avez-vous connus ?</Label>
              <Input id="howFoundUs" value={howFoundUs} onChange={e => setHowFoundUs(e.target.value)} required placeholder="Recommandation d’un collègue" className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
```

- [ ] **Step 7: Verify**

```bash
pnpm vitest run "app/(auth)" app/onboarding actions/__tests__/public-schools.test.ts --exclude '**/.claude/**'
npx tsc --noEmit
```

Expected: pass. `app/(auth)/__tests__/signup.test.tsx` and `signup/__tests__/page.order.test.tsx` will likely need updating for the new required fields — the form no longer submits with name/email/password alone.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add actions/public-schools.ts actions/__tests__/public-schools.test.ts app/onboarding/SchoolCombobox.tsx "app/(auth)/signup/page.tsx" "app/(auth)/__tests__/signup.test.tsx" "app/(auth)/signup/__tests__/page.order.test.tsx"
git commit -m "feat(signup): capture school, role and how-found-us at signup"
```

---

## Task 7: The /admin review queue

**Files:**
- Create: `lib/auth/admin.ts`, `lib/auth/__tests__/admin.test.ts`, `app/admin/page.tsx`, `app/admin/actions.ts`, `app/admin/__tests__/actions.test.ts`
- Modify: `lib/supabase/__tests__/admin-allowlist.test.ts`

**Interfaces:**
- Consumes: `Profile.status` (Task 2), `users.reviewed_at` / `notes` (Task 1).
- Produces: `isPlatformAdmin(email: string | null | undefined): boolean`; `approveUser(userId: string): Promise<{ ok: boolean }>`; `rejectUser(userId: string): Promise<{ ok: boolean }>`.

- [ ] **Step 1: Write the failing admin-identity test**

Create `lib/auth/__tests__/admin.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isPlatformAdmin } from '../admin'

const original = process.env.ADMIN_EMAILS
beforeEach(() => { process.env.ADMIN_EMAILS = 'Owner@Example.com, second@example.com' })
afterEach(() => { process.env.ADMIN_EMAILS = original })

describe('isPlatformAdmin', () => {
  it('matches case-insensitively', () => {
    expect(isPlatformAdmin('OWNER@example.com')).toBe(true)
  })
  it('matches a later entry in the list', () => {
    expect(isPlatformAdmin('second@example.com')).toBe(true)
  })
  it('rejects an unlisted address', () => {
    expect(isPlatformAdmin('someone@else.com')).toBe(false)
  })
  it('rejects null and empty', () => {
    expect(isPlatformAdmin(null)).toBe(false)
    expect(isPlatformAdmin('')).toBe(false)
  })
  it('denies everyone when the variable is unset', () => {
    delete process.env.ADMIN_EMAILS
    expect(isPlatformAdmin('owner@example.com')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
pnpm vitest run lib/auth/__tests__/admin.test.ts --exclude '**/.claude/**'
```

Expected: FAIL — cannot resolve `../admin`.

- [ ] **Step 3: Write the helper**

Create `lib/auth/admin.ts`:

```ts
// Platform-admin identity, deliberately NOT a database column: there is no row
// to escalate and no policy that can leak it. Rotating access is a Vercel env
// edit plus a redeploy. Distinct from users.org_role, which is school-level.
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(email.trim().toLowerCase())
}
```

- [ ] **Step 4: Run to confirm it passes**

```bash
pnpm vitest run lib/auth/__tests__/admin.test.ts --exclude '**/.claude/**'
```

Expected: 5 passing.

- [ ] **Step 5: Write the failing actions test**

Create `app/admin/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn(() => ({ eq: async () => ({ error: null }) }))
const getProfile = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update }) }) }))
vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveUser, rejectUser } from '../actions'

beforeEach(() => { update.mockClear(); getProfile.mockReset() })

describe('admin review actions', () => {
  it('approves and stamps reviewed_at', async () => {
    getProfile.mockResolvedValue({ email: 'owner@example.com' })
    process.env.ADMIN_EMAILS = 'owner@example.com'
    const res = await approveUser('u1')
    expect(res).toEqual({ ok: true })
    const patch = update.mock.calls[0][0] as { status: string; reviewed_at: string }
    expect(patch.status).toBe('approved')
    expect(patch.reviewed_at).toBeTruthy()
  })

  it('rejects and stamps reviewed_at', async () => {
    getProfile.mockResolvedValue({ email: 'owner@example.com' })
    process.env.ADMIN_EMAILS = 'owner@example.com'
    await rejectUser('u1')
    expect((update.mock.calls[0][0] as { status: string }).status).toBe('rejected')
  })

  it('refuses a non-admin without touching the database', async () => {
    getProfile.mockResolvedValue({ email: 'someone@else.com' })
    process.env.ADMIN_EMAILS = 'owner@example.com'
    await expect(approveUser('u1')).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a session with no profile', async () => {
    getProfile.mockResolvedValue(null)
    await expect(approveUser('u1')).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run it to confirm it fails**

```bash
pnpm vitest run app/admin/__tests__/actions.test.ts --exclude '**/.claude/**'
```

Expected: FAIL — cannot resolve `../actions`.

- [ ] **Step 7: Write the actions**

Create `app/admin/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/supabase/request'
import { isPlatformAdmin } from '@/lib/auth/admin'

// Unlike the rest of the app, an unauthorized call here is not an expected
// outcome to surface in the UI — /admin 404s for non-admins, so reaching these
// at all means something is wrong. Throwing is correct; 'Unauthorized' matches
// the string convention in lib/auth/require.ts.
async function requirePlatformAdmin(): Promise<void> {
  const profile = await getProfile()
  if (!profile || !isPlatformAdmin(profile.email)) throw new Error('Unauthorized')
}

async function setStatus(userId: string, status: 'approved' | 'rejected') {
  await requirePlatformAdmin()
  // Service role: `status` and `reviewed_at` have no grant for authenticated,
  // by design (migration 20260725160000).
  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) return { ok: false }
  revalidatePath('/admin')
  return { ok: true }
}

export async function approveUser(userId: string) { return setStatus(userId, 'approved') }
export async function rejectUser(userId: string) { return setStatus(userId, 'rejected') }
```

- [ ] **Step 8: Add the route to the service-role allowlist**

In `lib/supabase/__tests__/admin-allowlist.test.ts`, add to `ALLOWLIST` (the array is `.sort()`ed, so position does not matter):

```ts
  // Review queue for the manual signup approval gate: writes users.status and
  // reviewed_at, which have no grant for the authenticated role by design.
  'app/admin/actions.ts',
```

- [ ] **Step 9: Write the page**

Create `app/admin/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformAdmin } from '@/lib/auth/admin'
import { approveUser, rejectUser } from './actions'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  email: string
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  role_description: string | null
  how_found_us: string | null
  created_at: string
  reviewed_at: string | null
  notes: string | null
  schools: { name: string } | null
}

// Deliberately top-level, outside the (organizer) route group: it must take
// neither the organizer shell nor the mustOnboard gate.
export default async function AdminPage() {
  const profile = await getProfile()
  if (!profile || !isPlatformAdmin(profile.email)) notFound()

  // Service role: an approved organizer can only read their own school's users.
  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('id, email, full_name, status, role_description, how_found_us, created_at, reviewed_at, notes, schools(name)')
    .eq('role', 'organizer')
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="mx-auto max-w-[900px] px-6 py-10">
      <h1 className="mb-6 font-display text-[26px] font-bold tracking-[-0.02em] text-[#10203F]">
        Demandes d’accès
      </h1>
      {rows.length === 0 && <p className="text-[#5B6B8C]">Aucune demande.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-[12px] border border-[#E4E9F2] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-[15px] text-[#10203F]">
                <div className="font-semibold">{r.full_name || '—'}</div>
                <div className="text-[#5B6B8C]">{r.email}</div>
                <div className="text-[#5B6B8C]">{r.schools?.name || <em>établissement non renseigné (Google)</em>}</div>
                <div className="mt-1 text-[13px] text-[#8A97B2]">
                  Rôle : {r.role_description || '—'} · Nous a connus par : {r.how_found_us || '—'}
                </div>
                <div className="text-[13px] text-[#8A97B2]">
                  Inscrit le {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  {r.reviewed_at && ` · examiné le ${new Date(r.reviewed_at).toLocaleDateString('fr-FR')}`}
                </div>
                {r.notes && <div className="mt-1 text-[13px] text-[#5B6B8C]">Note : {r.notes}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs uppercase text-[#8A97B2]">{r.status}</span>
                {r.status !== 'approved' && (
                  <form action={approveUser.bind(null, r.id)}>
                    <Button type="submit" className="h-9 rounded-[9px] bg-[#22A06B] px-3 text-sm font-semibold hover:bg-[#1B8557]">
                      Approuver
                    </Button>
                  </form>
                )}
                {r.status !== 'rejected' && (
                  <form action={rejectUser.bind(null, r.id)}>
                    <Button type="submit" variant="outline" className="h-9 rounded-[9px] px-3 text-sm font-semibold">
                      Refuser
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 10: Run the tests**

```bash
pnpm vitest run app/admin lib/auth lib/supabase --exclude '**/.claude/**'
npx tsc --noEmit
```

Expected: pass, including the allowlist test with the new entry.

- [ ] **Step 11: Commit**

```bash
git branch --show-current
git add lib/auth/admin.ts lib/auth/__tests__/admin.test.ts app/admin/page.tsx app/admin/actions.ts app/admin/__tests__/actions.test.ts lib/supabase/__tests__/admin-allowlist.test.ts
git commit -m "feat(admin): signup review queue behind ADMIN_EMAILS"
```

---

## Task 8: Environment, documentation, and the full gate

**Files:**
- Modify: `.env.example`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Document the variable**

Add to `.env.example`, in the same style as the surrounding entries:

```bash
# Comma-separated addresses allowed to open /admin (the signup approval queue),
# and the recipients of new-signup notifications. Not a database column on
# purpose: no row to escalate, no policy that can leak it. Unset = /admin 404s
# for everyone and signup alerts are silently skipped.
ADMIN_EMAILS=you@example.com
```

- [ ] **Step 2: Document the gate in CLAUDE.md**

Add under **Gotchas & Conventions**, immediately after the existing RLS bullets:

```markdown
- **Signup is open but gated.** A self-registered organizer lands `pending` and has
  zero access until approved at `/admin` (gated by `ADMIN_EMAILS`, not a DB column).
  The gate is `public.my_role()`: it returns the role **only** when
  `users.status = 'approved'`, so every policy written as `my_role() = 'organizer'
  AND …` inherits it — including future ones. Do not add an `is_approved()` clause;
  there is deliberately one gate in one place. Initial status is decided by the
  `set_initial_user_status()` BEFORE INSERT trigger (students and colleagues joining
  an approved school are auto-approved; `signup_allowlist` pre-approves testers), so
  new user-creation paths need no changes. `users.status`, `reviewed_at` and `notes`
  have no column grant for `authenticated` — only the service role writes them.
  Spec: `docs/superpowers/specs/2026-07-25-signup-approval-gate-design.md`.
```

- [ ] **Step 3: Run the full verification gate**

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:rls
```

Expected: all four green. Per CLAUDE.md, any change touching `supabase/migrations/` or RLS policies must pass `pnpm test:rls`.

If `pnpm build` fails with a shifting ENOENT filename under `.next`, orphaned `next build` workers from a previous failed build are racing the directory — kill them by `/proc` cwd, never with `pkill -f "next build"`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add .env.example CLAUDE.md
git commit -m "docs: document the signup approval gate"
```

---

## Task 9: Deploy — staging, then production

Not code. Do these in order and stop at the first surprise.

- [ ] **Step 1: Set `ADMIN_EMAILS` in Vercel**

Add it to all three targets (Production, Preview, Development). Value: `bjornstephany@gmail.com` unless Bjorn names others.

- [ ] **Step 2: Apply the migration to staging first**

```bash
set -a; source .env.staging; set +a
supabase db push --db-url "$STAGING_DB_URL"
```

Never skip the staging apply — drift breaks previews mysteriously. If the push hangs, it is the known WSL2 IPv6 issue: resolve with `getent ahostsv4` and substitute the IPv4 address into `--db-url`.

Note the staging seed (`scripts/seed-staging.mjs`) creates `demo-organizer@example.com`. The migration's blanket `update users set status = 'approved'` covers every row that exists at apply time, so the demo organizer keeps working. A *newly* seeded organizer after this point would land pending — add their address to `signup_allowlist` on staging if that bites.

- [ ] **Step 3: Apply to production via MCP**

Use the Supabase MCP `apply_migration` tool with `name` = `signup_approval_gate`. **Never** `supabase db push` against prod.

- [ ] **Step 4: Reconcile the migration ledger**

Check MCP `list_migrations`. If prod stamped a version different from `20260725160000`, `git mv` the local file to the stamped version, and update staging's ledger to match — otherwise it re-drifts.

- [ ] **Step 5: Regenerate types against prod and verify**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim → `npx tsc --noEmit`. Commit if the file changed.

- [ ] **Step 6: Verify the gate in production, read-only**

Via MCP `execute_sql`:

```sql
select email, status, created_at from public.users order by created_at desc;
select count(*) as orphan_schools from public.schools s
  where not exists (select 1 from public.users u where u.school_id = s.id);
```

Expected: the two test accounts `approved`, `marvanemust@gmail.com` `pending`, and one orphan school (the stub created for them — it has a member, so zero orphans is also correct; anything above 1 means the delete missed).

- [ ] **Step 7: Merge and deploy**

Merging to `main` deploys to production and requires the full gate green **and** Bjorn's confirmation. Ask before merging.

After pushing, wait **at least 10 minutes** before concluding the Vercel git integration missed the push — it has fired as late as 5m40s, and checking too early has repeatedly produced a false "it didn't deploy".

- [ ] **Step 8: Manual smoke test in production**

Cannot be automated; do these by hand in a browser.

1. Sign up at `/signup` with a fresh address. Confirm the 6-digit code. Expect to land on `/pending`, not `/onboarding`.
2. Confirm the notification email arrives at `ADMIN_EMAILS`.
3. Try to reach `/dashboard`, `/applications`, `/students` directly. Expect `/pending` every time.
4. Open `/admin` as Bjorn. Expect the new request with school, role, and how-found-us.
5. Approve it. As that user, reload. Expect `/onboarding` opening on **step 2** (the school is already named from the registry pick).
6. Open `/admin` while signed in as a non-admin account. Expect a 404.

---

## Self-Review

**Spec coverage.** §1 schema → Task 1. §2 the gate → Task 1. §3 column grants → Task 1. §4 app layer (middleware, layouts, `/pending`, `/admin`, signup form, anonymous search) → Tasks 3, 6, 7. §5 initial status trigger → Task 1. §6 notification, including the failure path → Task 5. §7 Google limitation → handled in Task 4 (`provisionOrganizerFromOAuth` keeps a blank school) and surfaced in Task 7's page ("établissement non renseigné (Google)"). Migration & rollout → Tasks 1 and 9. Verification → Tasks 1 and 9. No gaps.

**Placeholders.** None. Every code step carries the code; every command carries its expected result.

**Type consistency.** `ProvisionResult` gains `status` in Task 4 and is consumed with that shape in Tasks 4 and 5. `Profile.status` is defined in Task 2 and read in Tasks 3 and 7. `isPlatformAdmin` is defined in Task 7 Step 3 and used in Steps 7 and 9 of that task with the same signature. `SchoolOption` is imported from `lib/schools/registry` everywhere. `searchPublicSchools` is defined in Task 6 Step 3 and passed as `SchoolCombobox`'s `search` prop in Step 6 with a matching type.

**Known risk carried into execution.** Task 6 Step 7 says the two existing signup test files "will likely need updating" without giving their new content — the required change depends on how they currently drive the form, which the implementer will see. This is the one place in the plan where judgment is required rather than transcription.

---

## Execution Progress (2026-07-25)

**Tasks 1–8: DONE, committed on `feature/signup-approval-gate`.** Full gate green at
`bf184c7`: `pnpm lint` clean, `pnpm test` 1791/229 files, `pnpm build` OK (`/pending`
and `/admin` both in the route table), `pnpm test:rls` 193 (162 pre-existing + 31 new).

| Commit | Task |
|---|---|
| `eef1e50` | 1 — migration + RLS gate + `tests/rls/approval-gate.test.ts` |
| `f8ef04e` | 2 — types + `Profile.status` |
| `7e0eee3` | 3 — `/pending` + middleware/layout redirects |
| `f16699e` | 5 — signup notification emails (moved ahead of Task 4, see below) |
| `a74d9c4` | 4 — provisioning: intake fields, registry school, status read-back |
| `34813bb` | 6 — anonymous registry search + signup form fields |
| `b1f75b0` | 7 — `/admin` review queue |
| `bf184c7` | 8 — `.env.example` + `CLAUDE.md` |

**Task 9 (deploy) is NOT started.** Resume there. It needs Bjorn: the Vercel
`ADMIN_EMAILS` value, and confirmation before merging to `main`.

### Deviations from the plan as written

1. **Migration — the prod-only backfill row is guarded.** `public.users.id` references
   `auth.users(id)`, and the auth row for `marvanemust@gmail.com` exists only in prod.
   Unguarded, the insert fails `supabase db reset` and the staging apply with a foreign
   key violation. It is now inside a `do $$ … end $$` that checks the `auth.users` row
   exists (and no profile exists yet); the stub school insert is inside the same guard so
   no orphan school is created where the user does not exist. **On prod it still runs.**

2. **`tests/rls/seed.ts` — `orgPending` needs an explicit UPDATE, and cleanup.**
   `set_initial_user_status()` auto-approves any organizer joining a school that already
   has an approved organizer, and `orgA` — inserted by the *same* multi-row statement —
   is visible to the trigger. So the persona is inserted, then forced back with
   `update users set status = 'pending'`. The trigger rule is correct for real colleague
   invites; the fixture is the special case. `orgPending` was also added to the
   `delete from auth.users` list in `cleanupFixtures` (the plan omitted it, which would
   have made the `delete from schools` fail on the FK).

3. **`approval-gate.test.ts` — two fixes to the plan's code.** The
   `set_initial_user_status` cases create an `auth.users` row before each profile insert
   (same FK). The non-vacuousness test uses a flat `sql.begin`, not a `sql.begin` nested
   inside `runAs` — the RLS pool is `max: 1`, so a nested transaction would deadlock.

4. **`types/supabase.ts` was hand-written, not generated.** `supabase gen types` shells
   out to the `docker` CLI, which is not installed in this WSL distro (the Supabase CLI
   itself works — it talks to the daemon socket, which is why `db reset` succeeds). The
   edit is additive and follows generator conventions exactly (alphabetical keys, the new
   `signup_allowlist` table between `schools` and `submissions`). **Task 9 Step 5 is the
   correction point** — regenerate from prod via MCP and overwrite verbatim; commit if
   it differs.

5. **Task 5 landed before Task 4.** Task 4's `provision.ts` imports
   `sendSignupRequestEmail` / `sendSignupFailureEmail`; running `tsc` between the two
   tasks in plan order would fail. Both plan commit messages are preserved.

6. **`app/admin/page.tsx` was added to the service-role allowlist too**, not just
   `app/admin/actions.ts` — the page imports `createAdminClient` and the allowlist test
   scans `app/`.

7. **`<form action>` needs a void-returning action.** `approveUser` / `rejectUser` return
   `{ ok }`, so `app/admin/actions.ts` also exports thin `approveUserForm` /
   `rejectUserForm` wrappers, which is what the page binds.

8. **Existing tests updated for the new behaviour** (beyond the two the plan predicted):
   `app/__tests__/middleware.test.ts` (+3 gate cases), `app/__tests__/onboarding-page.test.ts`
   (+1), `app/__tests__/confirm.test.ts` (+1), `app/(auth)/signup/__tests__/actions.test.ts`
   (split into pending/approved destinations), `app/(auth)/__tests__/signup.test.tsx`.
   Note the last one **deliberately reverses** its old assertion « does not render an
   Établissement field » — the picker is back on `/signup` by design.
