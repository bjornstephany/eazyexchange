# Auto-assign Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically keep `assignments` in sync so every enrolled student is assigned every same-school form template in their exchange — in both directions, enforced in the database.

**Architecture:** Two `AFTER INSERT` triggers (one on `form_templates`, one on `exchange_enrollments`) fan out `assignments` rows under a single school-scoped rule, plus a one-time backfill in the same migration. The redundant, error-swallowing fan-out code in `inviteStudent` is then removed.

**Tech Stack:** Supabase Postgres (RLS, `SECURITY DEFINER` trigger functions), Next.js Server Actions (TypeScript), Supabase CLI for migrations.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Verify before completion: `pnpm lint`, `pnpm test`, `pnpm build` must pass. Locally `pnpm build` may fail on placeholder env — fall back to `pnpm exec tsc --noEmit` for type checking.
- New DB access/behavior goes through a **migration** in `supabase/migrations/`, never a client-side service-role workaround.
- Trigger functions use `language plpgsql security definer set search_path = public`, matching the existing helper-function pattern in `20260625000005_fix_rls_recursion.sql`.
- Assignment rule (verbatim from spec): a student S is assigned template T **iff** S is enrolled in T's exchange AND `S.school_id = T.school_id` AND `S.role = 'student'`.
- Migrations are applied to the remote (prod) DB via `node_modules/.bin/supabase db push` (the MCP connection is read-only). The CLI has cached credentials.
- **Never push broken code to `main`.** Work stays on branch `feature/auto-assign-forms`.

---

### Task 1: Create and apply the auto-assign migration

**Files:**
- Create: `supabase/migrations/20260627000001_auto_assign_forms.sql`

**Interfaces:**
- Produces (DB objects later code/tests rely on):
  - function `assign_students_to_new_template()` → trigger `trg_assign_on_template_insert` on `form_templates`
  - function `assign_templates_to_new_enrollment()` → trigger `trg_assign_on_enrollment_insert` on `exchange_enrollments`
  - Postcondition: zero missing (template × enrolled-same-school-student) assignment rows.

- [ ] **Step 1: Write the failing assertion — confirm the gap exists**

This query counts student/template pairs that *should* have an assignment but don't. Run it via the Supabase MCP `execute_sql` (read-only is fine):

```sql
select count(*) as missing_assignments
from form_templates ft
join exchange_enrollments e on e.exchange_id = ft.exchange_id
join users u on u.id = e.user_id
where u.school_id = ft.school_id
  and u.role = 'student'
  and not exists (
    select 1 from assignments a
    where a.template_id = ft.id and a.student_id = u.id
  );
```

Expected NOW: `missing_assignments` > 0 (the bug). Record the number — Step 5 must drive it to 0.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260627000001_auto_assign_forms.sql` with exactly:

```sql
-- Keep assignments in sync automatically. A student is assigned a template iff
-- they are enrolled in the template's exchange, belong to the template's school,
-- and have role 'student'. Two AFTER INSERT triggers maintain this in both
-- directions; a one-time backfill closes the existing gap.
--
-- SECURITY DEFINER so the inner insert into assignments is not blocked by RLS,
-- regardless of which user triggered it (matches the helper-fn pattern in
-- 20260625000005_fix_rls_recursion.sql).

-- New template -> assign every enrolled, same-school student.
create or replace function assign_students_to_new_template()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into assignments (template_id, student_id)
  select new.id, u.id
  from exchange_enrollments e
  join users u on u.id = e.user_id
  where e.exchange_id = new.exchange_id
    and u.school_id = new.school_id
    and u.role = 'student'
  on conflict (template_id, student_id) do nothing;
  return new;
end;
$$;

create trigger trg_assign_on_template_insert
  after insert on form_templates for each row
  execute function assign_students_to_new_template();

-- New enrollment -> assign every existing same-school template in the exchange.
create or replace function assign_templates_to_new_enrollment()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into assignments (template_id, student_id)
  select ft.id, new.user_id
  from form_templates ft
  join users u on u.id = new.user_id
  where ft.exchange_id = new.exchange_id
    and ft.school_id = u.school_id
    and u.role = 'student'
  on conflict (template_id, student_id) do nothing;
  return new;
end;
$$;

create trigger trg_assign_on_enrollment_insert
  after insert on exchange_enrollments for each row
  execute function assign_templates_to_new_enrollment();

-- One-time backfill for rows created before these triggers existed.
insert into assignments (template_id, student_id)
select ft.id, u.id
from form_templates ft
join exchange_enrollments e on e.exchange_id = ft.exchange_id
join users u on u.id = e.user_id
where u.school_id = ft.school_id and u.role = 'student'
on conflict (template_id, student_id) do nothing;
```

- [ ] **Step 3: Apply the migration to the remote database**

```bash
cd /home/bjorn/eazyexchange
node_modules/.bin/supabase db push --include-all
```

Expected: `Applying migration 20260627000001_auto_assign_forms.sql...` then `Finished supabase db push.` (A non-fatal `pgdelta` cert cache warning may appear — ignore it; it is a CLI catalog-cache step, not the migration.)

- [ ] **Step 4: Verify the trigger objects exist**

Run via MCP `execute_sql`:

```sql
select tgname, tgrelid::regclass as table_name
from pg_trigger
where tgname in ('trg_assign_on_template_insert','trg_assign_on_enrollment_insert')
order by tgname;
```

Expected: two rows — `trg_assign_on_enrollment_insert` on `exchange_enrollments`, `trg_assign_on_template_insert` on `form_templates`.

- [ ] **Step 5: Re-run the assertion — confirm the gap is closed**

Run the Step 1 query again via MCP `execute_sql`.
Expected: `missing_assignments` = **0**.

- [ ] **Step 6: Trigger-behavior test (transactional, rolls back — safe on prod)**

In the Supabase Dashboard → SQL Editor, run this. It inserts a template into an exchange that has enrolled students, asserts assignments appeared, then rolls back so nothing persists:

```sql
begin;
-- pick an exchange that currently has at least one enrolled student
with target as (
  select e.exchange_id, ft.school_id
  from exchange_enrollments e
  join users u on u.id = e.user_id and u.role = 'student'
  join form_templates ft on ft.exchange_id = e.exchange_id and ft.school_id = u.school_id
  limit 1
),
ins as (
  insert into form_templates (exchange_id, school_id, name, type, deadline, created_by)
  select t.exchange_id, t.school_id, 'TRIGGER TEST (rollback)', 'data_entry', current_date,
         (select id from users where school_id = t.school_id and role = 'organizer' limit 1)
  from target t
  returning id, exchange_id, school_id
)
select
  (select count(*) from assignments a where a.template_id = (select id from ins)) as new_assignments,
  (select count(*) from exchange_enrollments e
     join users u on u.id = e.user_id and u.role='student'
     where e.exchange_id = (select exchange_id from ins)
       and u.school_id = (select school_id from ins)) as expected_assignments;
rollback;
```

Expected: `new_assignments` = `expected_assignments` (and both > 0). The `rollback` discards the test template and its assignments.

- [ ] **Step 7: Commit**

```bash
cd /home/bjorn/eazyexchange
git add supabase/migrations/20260627000001_auto_assign_forms.sql
git commit -m "feat: auto-assign forms to enrolled students via DB triggers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Remove the redundant fan-out from inviteStudent

**Files:**
- Modify: `actions/students.ts` (the `inviteStudent` function — remove the template-fan-out block, keep the enrollment insert and `revalidatePath`)

**Interfaces:**
- Consumes: trigger `trg_assign_on_enrollment_insert` from Task 1 (now performs the fan-out the deleted code used to do).
- Produces: `inviteStudent(exchangeId, email)` unchanged in signature/behavior from the caller's view; assignment creation now happens in the DB.

- [ ] **Step 1: Remove the fan-out block**

In `actions/students.ts`, delete the template query and assignment upsert (currently the block starting `// Auto-assign all current templates...` through the `if (templates && templates.length > 0) { ... }`). Keep the `exchange_enrollments` insert above it and the `revalidatePath` below it.

Before (end of `inviteStudent`):

```ts
  // Enroll in exchange
  const { error: enrollError } = await supabase.from('exchange_enrollments').insert({
    exchange_id: exchangeId,
    user_id: invited.user.id,
  })
  // Ignore duplicate enrollment
  if (enrollError && enrollError.code !== '23505') throw enrollError

  // Auto-assign all current templates for this exchange from the organizer's school
  const { data: templates } = await supabase
    .from('form_templates')
    .select('id')
    .eq('exchange_id', exchangeId)
    .eq('school_id', profile.school_id)

  if (templates && templates.length > 0) {
    await supabase.from('assignments').upsert(
      templates.map(t => ({ template_id: t.id, student_id: invited.user.id }))
    )
  }

  revalidatePath(`/exchanges/${exchangeId}/students`)
}
```

After:

```ts
  // Enroll in exchange. The trg_assign_on_enrollment_insert trigger fans out
  // assignments for all existing same-school templates in this exchange, so no
  // application-side assignment is needed here.
  const { error: enrollError } = await supabase.from('exchange_enrollments').insert({
    exchange_id: exchangeId,
    user_id: invited.user.id,
  })
  // Ignore duplicate enrollment
  if (enrollError && enrollError.code !== '23505') throw enrollError

  revalidatePath(`/exchanges/${exchangeId}/students`)
}
```

- [ ] **Step 2: Type-check and verify nothing else references the removed code**

```bash
cd /home/bjorn/eazyexchange
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

Expected: all pass. (If `pnpm build` is run instead of `tsc`, it may fail only on placeholder Supabase env — that is unrelated to this change.)

- [ ] **Step 3: End-to-end manual verification**

1. As an organizer, invite a brand-new student into an exchange that already has templates. Confirm in `/my-forms` (as that student) that all same-school forms appear.
2. As an organizer, create a new form in an exchange with already-enrolled students. Confirm an enrolled student now sees it in `/my-forms`.
3. Confirm via MCP that the assertion query from Task 1 Step 1 still returns `0`.

- [ ] **Step 4: Commit**

```bash
cd /home/bjorn/eazyexchange
git add actions/students.ts
git commit -m "refactor: drop app-side assignment fan-out now handled by DB trigger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes for the executor

- Tasks are ordered: Task 1 (the trigger) must be applied before Task 2 removes the app-side fan-out, otherwise invites between the two tasks would create no assignments.
- Do not run `supabase db push` without `--include-all`; the new migration's timestamp precedes already-applied `20260625000005`, and `--include-all` is required to apply an out-of-order pending file. It will still only apply the one genuinely-pending migration.
- The remote migration history was reconciled earlier this session (all of `…02`–`…05` are recorded as applied), so `db push` will not attempt to re-run them.
