# Security Hardening (C1 + H1 + H2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three highest-severity findings from the 2026-06-28 security audit — students self-approving submissions (C1), students tampering with their school's form config/assignments (H1), and cross-tenant access to `exchange_enrollments` (H2).

**Architecture:** Three new Postgres migrations tighten RLS at the database boundary (a `BEFORE INSERT/UPDATE` trigger guarding submission review columns; role checks added to the `form_fields`/`document_slots`/`assignments` policies; school-scoped `exchange_enrollments` policies via a `SECURITY DEFINER` helper). A parallel change adds organizer authorization guards to `actions/forms.ts` as defense-in-depth. RLS changes are verified with committed SQL test scripts run through the Supabase MCP (fixtures created and rolled back in one transaction); the server-action change is verified with vitest unit tests matching the existing mock pattern.

**Tech Stack:** Next.js 14 App Router (Server Actions), Supabase (Postgres + RLS), vitest, pnpm.

## Global Constraints

- Package manager is **pnpm** (never npm).
- **All access-control changes go in a migration** under `supabase/migrations/` — never a client-side service-role workaround.
- **Apply migrations via the Supabase MCP** `apply_migration` tool, using the **same name** as the migration file (timestamp without `.sql`), so the DB history matches the committed file. (`supabase db push` is the CLI equivalent if the CLI is configured.)
- **Run SQL test scripts via the Supabase MCP** `execute_sql` tool (paste the file contents). A script PASSES when it ends with a raised notice/error containing `ROLLBACK_OK`; it FAILS if it raises any message containing `FAIL`. Every script rolls back all fixtures — nothing persists.
- **Never log student/parent PII.**
- New `SECURITY DEFINER` functions must include `set search_path = public` (matches `20260625000005_fix_rls_recursion.sql`).
- **Verification commands** (run before any commit that changes TS):
  - `pnpm lint`
  - `pnpm test`
  - `npx tsc --noEmit`  — use this instead of `pnpm build`; `.env.local` holds placeholders so a local `pnpm build` fails for unrelated reasons.
- **Work on a branch:** before Task 1, create `git checkout -b security-hardening-c1-h1-h2`. Do not merge to `main` until all tasks pass and the user confirms (merging deploys to production via Vercel).
- **Fixture assumption (RLS test scripts):** the project creates profile rows in application code, so there is no `on_auth_user_created` trigger on `auth.users`. If a script errors because a `public.users` row already exists after the `auth.users` insert, such a trigger exists — remove the explicit `users` insert for that id and proceed.

---

### Task 1: C1 — Guard submission review columns

A student owns their submission row (RLS lets them insert/update/delete it), but must not be able to approve/reject it or write the reviewer columns. A `BEFORE INSERT OR UPDATE` trigger enforces this; students may still move `status` between `draft` and `submitted`.

**Files:**
- Create: `supabase/tests/c1_submission_review.test.sql`
- Create: `supabase/migrations/20260628000001_guard_submission_review.sql`

**Interfaces:**
- Produces (DB): function `public.guard_submission_review()` returning `trigger`; trigger `trg_guard_submission_review` on `submissions`. Relies on existing helpers `my_role()`, `my_school_id()`, `submission_school(uuid)`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/c1_submission_review.test.sql`:

```sql
-- C1: a student cannot approve/reject or set reviewer fields on their own
-- submission; an organizer of the owning school can. All fixtures roll back.
-- PASS = ends with "ROLLBACK_OK"; FAIL = raises a message containing "FAIL".
do $$
declare
  v_school_a uuid := gen_random_uuid();
  v_school_b uuid := gen_random_uuid();
  v_student  uuid := gen_random_uuid();
  v_org      uuid := gen_random_uuid();
  v_exchange uuid := gen_random_uuid();
  v_template uuid := gen_random_uuid();
  v_assignment uuid;
  v_submission uuid;
begin
  -- Fixtures (privileged role; bypasses RLS)
  insert into schools(id, name) values (v_school_a, 'C1 A'), (v_school_b, 'C1 B');
  insert into auth.users(id, instance_id, aud, role, email) values
    (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_student, '@test.dev')),
    (v_org,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org, '@test.dev'));
  insert into users(id, school_id, role, full_name, email) values
    (v_student, v_school_a, 'student',   'Stu', concat(v_student, '@test.dev')),
    (v_org,     v_school_a, 'organizer', 'Org', concat(v_org, '@test.dev'));
  insert into exchanges(id, name, year, school_a_id, school_b_id)
    values (v_exchange, 'C1 Ex', 2026, v_school_a, v_school_b);
  insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_student);
  insert into form_templates(id, exchange_id, school_id, name, type, deadline, created_by)
    values (v_template, v_exchange, v_school_a, 'C1 Form', 'data_entry', current_date + 7, v_org);
  select id into v_assignment from assignments where template_id = v_template and student_id = v_student;
  if v_assignment is null then raise exception 'C1 SETUP FAIL: assignment not auto-created'; end if;
  insert into submissions(assignment_id, status) values (v_assignment, 'submitted') returning id into v_submission;

  -- Impersonate the STUDENT
  perform set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    update submissions set status = 'approved' where id = v_submission;
    raise exception 'C1 FAIL: student approved own submission';
  exception when sqlstate '23514' then null; end;

  begin
    update submissions set reviewer_id = v_org, reviewed_at = now() where id = v_submission;
    raise exception 'C1 FAIL: student set reviewer fields';
  exception when sqlstate '23514' then null; end;

  update submissions set status = 'draft' where id = v_submission;  -- allowed transition

  reset role;

  -- Impersonate the ORGANIZER (owning school)
  perform set_config('request.jwt.claims', json_build_object('sub', v_org, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update submissions set status = 'approved', reviewed_at = now(), reviewer_id = v_org where id = v_submission;
  if not found then raise exception 'C1 FAIL: organizer could not approve'; end if;
  reset role;

  raise exception 'ROLLBACK_OK: C1 assertions passed';
end $$;
```

- [ ] **Step 2: Run the test to verify it fails (vulnerability present)**

Run via Supabase MCP `execute_sql` with the file contents.
Expected: raises **`C1 FAIL: student approved own submission`** (no trigger yet, so the student's `update ... approved` succeeds and the script's guard fires).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260628000001_guard_submission_review.sql`:

```sql
-- C1: students own their submission row but must not set the review outcome.
-- This trigger rejects any change to review-controlled columns (status ->
-- approved/rejected, reviewer_id, reviewed_at, review_note) unless the caller is
-- an organizer for the school that owns the submission. Students may still move
-- status between draft and submitted. SECURITY DEFINER so the helper calls and
-- the submissions read are not re-filtered by RLS.
create or replace function guard_submission_review()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  touched boolean;
  is_org boolean;
begin
  if tg_op = 'INSERT' then
    touched := (new.status in ('approved', 'rejected'))
            or new.reviewer_id is not null
            or new.reviewed_at is not null
            or new.review_note is not null;
  else
    touched := (new.status is distinct from old.status and new.status in ('approved', 'rejected'))
            or new.reviewer_id is distinct from old.reviewer_id
            or new.reviewed_at is distinct from old.reviewed_at
            or new.review_note is distinct from old.review_note;
  end if;

  if touched then
    is_org := (my_role() = 'organizer' and submission_school(new.id) = my_school_id());
    if not coalesce(is_org, false) then
      raise exception 'Only an organizer for this school may set submission review fields'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_submission_review on submissions;
create trigger trg_guard_submission_review
  before insert or update on submissions for each row
  execute function guard_submission_review();
```

- [ ] **Step 4: Apply the migration**

Apply via Supabase MCP `apply_migration` with name `20260628000001_guard_submission_review` and the SQL above.

- [ ] **Step 5: Run the test to verify it passes**

Run `supabase/tests/c1_submission_review.test.sql` via `execute_sql`.
Expected: raises **`ROLLBACK_OK: C1 assertions passed`** and no `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260628000001_guard_submission_review.sql supabase/tests/c1_submission_review.test.sql
git commit -m "fix(security): block students from approving their own submissions (C1)"
```

---

### Task 2: H1 (DB) — Add organizer-role checks to child-table policies

The `organizers manage …` policies on `form_fields`, `document_slots`, and `assignments` check only the school, not the role, so any same-school student can write them. Add `my_role() = 'organizer'` (and explicit `with check`).

**Files:**
- Create: `supabase/tests/h1_child_table_policies.test.sql`
- Create: `supabase/migrations/20260628000002_child_table_role_checks.sql`

**Interfaces:**
- Consumes (DB): existing helpers `my_role()`, `my_school_id()`, `template_school(uuid)`.
- Produces (DB): recreated policies `organizers manage fields` / `… slots` / `… assignments` now requiring organizer role on both `using` and `with check`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/h1_child_table_policies.test.sql`:

```sql
-- H1: a student cannot insert/delete form fields or modify assignments for their
-- school's templates; an organizer of that school can. Fixtures roll back.
-- PASS = "ROLLBACK_OK"; FAIL = a message containing "FAIL".
do $$
declare
  v_school_a uuid := gen_random_uuid();
  v_school_b uuid := gen_random_uuid();
  v_student  uuid := gen_random_uuid();
  v_org      uuid := gen_random_uuid();
  v_exchange uuid := gen_random_uuid();
  v_template uuid := gen_random_uuid();
  v_field    uuid := gen_random_uuid();
  v_assignment uuid;
  n int;
begin
  insert into schools(id, name) values (v_school_a, 'H1 A'), (v_school_b, 'H1 B');
  insert into auth.users(id, instance_id, aud, role, email) values
    (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_student, '@test.dev')),
    (v_org,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org, '@test.dev'));
  insert into users(id, school_id, role, full_name, email) values
    (v_student, v_school_a, 'student',   'Stu', concat(v_student, '@test.dev')),
    (v_org,     v_school_a, 'organizer', 'Org', concat(v_org, '@test.dev'));
  insert into exchanges(id, name, year, school_a_id, school_b_id)
    values (v_exchange, 'H1 Ex', 2026, v_school_a, v_school_b);
  insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_student);
  insert into form_templates(id, exchange_id, school_id, name, type, deadline, created_by)
    values (v_template, v_exchange, v_school_a, 'H1 Form', 'data_entry', current_date + 7, v_org);
  insert into form_fields(id, template_id, label, field_type, required, "order")
    values (v_field, v_template, 'Existing', 'text', true, 0);
  select id into v_assignment from assignments where template_id = v_template and student_id = v_student;

  -- Impersonate the STUDENT
  perform set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    insert into form_fields(template_id, label, field_type, required, "order")
      values (v_template, 'Injected', 'text', true, 1);
    raise exception 'H1 FAIL: student inserted a form field';
  exception when sqlstate '42501' then null; end;  -- RLS WITH CHECK block = expected

  delete from form_fields where id = v_field;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'H1 FAIL: student deleted a form field (% rows)', n; end if;

  update assignments set assigned_at = now() where id = v_assignment;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'H1 FAIL: student updated an assignment (% rows)', n; end if;

  reset role;

  -- Impersonate the ORGANIZER (owning school)
  perform set_config('request.jwt.claims', json_build_object('sub', v_org, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into form_fields(template_id, label, field_type, required, "order")
    values (v_template, 'Org field', 'text', true, 2);  -- must succeed
  reset role;

  raise exception 'ROLLBACK_OK: H1 assertions passed';
end $$;
```

- [ ] **Step 2: Run the test to verify it fails (vulnerability present)**

Run via `execute_sql`.
Expected: raises **`H1 FAIL: student inserted a form field`** (current policy has no role check, so the student's insert succeeds).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260628000002_child_table_role_checks.sql`:

```sql
-- H1: the "organizers manage …" policies on these child tables checked only the
-- school, letting same-school students write them. Require organizer role and
-- mirror the condition into WITH CHECK so inserts are gated too.

-- form_fields
drop policy if exists "organizers manage fields" on form_fields;
create policy "organizers manage fields" on form_fields for all
  using (my_role() = 'organizer' and template_school(template_id) = my_school_id())
  with check (my_role() = 'organizer' and template_school(template_id) = my_school_id());

-- document_slots
drop policy if exists "organizers manage slots" on document_slots;
create policy "organizers manage slots" on document_slots for all
  using (my_role() = 'organizer' and template_school(template_id) = my_school_id())
  with check (my_role() = 'organizer' and template_school(template_id) = my_school_id());

-- assignments
drop policy if exists "organizers manage assignments" on assignments;
create policy "organizers manage assignments" on assignments for all
  using (my_role() = 'organizer' and template_school(template_id) = my_school_id())
  with check (my_role() = 'organizer' and template_school(template_id) = my_school_id());
```

- [ ] **Step 4: Apply the migration**

Apply via Supabase MCP `apply_migration`, name `20260628000002_child_table_role_checks`.

- [ ] **Step 5: Run the test to verify it passes**

Run `supabase/tests/h1_child_table_policies.test.sql`.
Expected: **`ROLLBACK_OK: H1 assertions passed`**, no `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260628000002_child_table_role_checks.sql supabase/tests/h1_child_table_policies.test.sql
git commit -m "fix(security): require organizer role on form_fields/slots/assignments policies (H1)"
```

---

### Task 3: H1 (app) — Authorization guards in `actions/forms.ts`

Defense-in-depth: the form-builder server actions currently perform no auth checks and rely entirely on RLS. Add organizer + template-ownership guards mirroring `submissions.ts`.

**Files:**
- Modify: `actions/forms.ts` (full rewrite below)
- Create: `actions/__tests__/forms.test.ts`

**Interfaces:**
- Produces: `forms.ts` exports unchanged in signature — `createTemplate(FormData)`, `getTemplate(id)`, `addField(templateId, label, fieldType, required, options?)`, `removeField(fieldId)`, `addSlot(templateId, label, description, required)`, `removeSlot(slotId)`. Each now throws `Error('Unauthorized')` for non-organizers or cross-school callers.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/forms.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  role: 'organizer' | 'student'
  profileSchool: string
  templateSchool: string
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        insert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          if (table === 'form_fields') return { data: { order: 0 }, error: null }
          if (table === 'document_slots') return { data: { order: 0 }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'form_templates') return { data: { school_id: scenario.templateSchool }, error: null }
          if (table === 'form_fields') return { data: { template_id: 'tmpl-1' }, error: null }
          if (table === 'document_slots') return { data: { template_id: 'tmpl-1' }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addField, removeField } from '../forms'

describe('forms.ts authorization', () => {
  beforeEach(() => {
    scenario = { userId: 'u1', role: 'organizer', profileSchool: 'school-1', templateSchool: 'school-1' }
  })

  it('rejects addField from a student', async () => {
    scenario.role = 'student'
    await expect(addField('tmpl-1', 'L', 'text', true)).rejects.toThrow('Unauthorized')
  })

  it('rejects addField for an organizer from another school', async () => {
    scenario.templateSchool = 'school-2'
    await expect(addField('tmpl-1', 'L', 'text', true)).rejects.toThrow('Unauthorized')
  })

  it('allows addField for the owning organizer', async () => {
    await expect(addField('tmpl-1', 'L', 'text', true)).resolves.toBeUndefined()
  })

  it('rejects removeField from a student', async () => {
    scenario.role = 'student'
    await expect(removeField('field-1')).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test actions/__tests__/forms.test.ts`
Expected: FAIL — the student/cross-school cases do not throw (no guards yet).

- [ ] **Step 3: Rewrite `actions/forms.ts` with guards**

Replace the entire contents of `actions/forms.ts` with:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FieldType, FormType } from '@/types/db'

// Throw unless the caller is an organizer. Returns the organizer's school_id.
async function assertOrganizer(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('users').select('school_id, role').eq('id', userId).single()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return profile.school_id as string
}

// Throw unless the caller is an organizer for the school that owns the template.
async function assertOrganizerOwnsTemplate(
  supabase: SupabaseClient, userId: string, templateId: string,
): Promise<void> {
  const schoolId = await assertOrganizer(supabase, userId)
  const { data: tmpl } = await supabase
    .from('form_templates').select('school_id').eq('id', templateId).maybeSingle()
  if (!tmpl || tmpl.school_id !== schoolId) throw new Error('Unauthorized')
}

export async function createTemplate(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const schoolId = await assertOrganizer(supabase, user.id)

  const exchangeId = formData.get('exchange_id') as string
  const name = formData.get('name') as string
  const description = formData.get('description') as string | null
  const type = formData.get('type') as FormType
  const deadline = formData.get('deadline') as string

  const { data, error } = await supabase.from('form_templates').insert({
    exchange_id: exchangeId,
    school_id: schoolId,
    name, description: description || null, type, deadline,
    created_by: user.id,
  }).select('id').single()
  if (error) throw error
  revalidatePath(`/exchanges/${exchangeId}`)
  return data.id
}

export async function getTemplate(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, user.id, id)

  const { data, error } = await supabase
    .from('form_templates')
    .select('*, form_fields(*), document_slots(*)')
    .eq('id', id)
    .order('order', { referencedTable: 'form_fields', ascending: true })
    .order('order', { referencedTable: 'document_slots', ascending: true })
    .single() as any
  if (error) throw error
  return data as any
}

export async function addField(templateId: string, label: string, fieldType: FieldType, required: boolean, options?: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, user.id, templateId)

  const { data: existing } = await supabase
    .from('form_fields').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('form_fields').insert({
    template_id: templateId, label, field_type: fieldType,
    required, options: options ?? null, order: nextOrder,
  })
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function removeField(fieldId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: field } = await supabase
    .from('form_fields').select('template_id').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found')
  await assertOrganizerOwnsTemplate(supabase, user.id, field.template_id)

  const { error } = await supabase.from('form_fields').delete().eq('id', fieldId)
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function addSlot(templateId: string, label: string, description: string | null, required: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertOrganizerOwnsTemplate(supabase, user.id, templateId)

  const { data: existing } = await supabase
    .from('document_slots').select('order').eq('template_id', templateId).order('order', { ascending: false }).limit(1).single()
  const nextOrder = (existing?.order ?? -1) + 1
  const { error } = await supabase.from('document_slots').insert({
    template_id: templateId, label, description: description || null, required, order: nextOrder,
  })
  if (error) throw error
  revalidatePath(`/exchanges`)
}

export async function removeSlot(slotId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: slot } = await supabase
    .from('document_slots').select('template_id').eq('id', slotId).maybeSingle()
  if (!slot) throw new Error('Slot not found')
  await assertOrganizerOwnsTemplate(supabase, user.id, slot.template_id)

  const { error } = await supabase.from('document_slots').delete().eq('id', slotId)
  if (error) throw error
  revalidatePath(`/exchanges`)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test actions/__tests__/forms.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run lint + typecheck**

Run: `pnpm lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add actions/forms.ts actions/__tests__/forms.test.ts
git commit -m "fix(security): add organizer authorization guards to form-builder actions (H1)"
```

---

### Task 4: H2 — Scope `exchange_enrollments` policies to the organizer's school

The enrollment SELECT/INSERT policies are gated only by `my_role() = 'organizer'`, so any organizer can read every school's enrollments and insert into any exchange. Scope both to exchanges the organizer's school participates in, via a `SECURITY DEFINER` helper (avoids RLS recursion against `exchanges`).

**Files:**
- Create: `supabase/tests/h2_enrollment_scope.test.sql`
- Create: `supabase/migrations/20260628000003_scope_enrollment_policies.sql`

**Interfaces:**
- Consumes (DB): existing helpers `my_role()`, `my_school_id()`.
- Produces (DB): function `public.exchange_in_my_school(uuid) returns boolean`; recreated policies `organizers read enrollments` / `organizers insert enrollments` scoped by that helper.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/h2_enrollment_scope.test.sql`:

```sql
-- H2: an organizer whose school is NOT part of an exchange cannot read or insert
-- its enrollments; an organizer of a participating school can. Fixtures roll back.
-- PASS = "ROLLBACK_OK"; FAIL = a message containing "FAIL".
do $$
declare
  v_school_a uuid := gen_random_uuid();  -- in the exchange
  v_school_b uuid := gen_random_uuid();  -- in the exchange
  v_school_c uuid := gen_random_uuid();  -- outside the exchange
  v_student  uuid := gen_random_uuid();  -- school A student
  v_org_a    uuid := gen_random_uuid();  -- school A organizer
  v_org_c    uuid := gen_random_uuid();  -- school C organizer
  v_exchange uuid := gen_random_uuid();  -- A <-> B
  n int;
begin
  insert into schools(id, name) values (v_school_a, 'H2 A'), (v_school_b, 'H2 B'), (v_school_c, 'H2 C');
  insert into auth.users(id, instance_id, aud, role, email) values
    (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_student, '@test.dev')),
    (v_org_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org_a, '@test.dev')),
    (v_org_c,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org_c, '@test.dev'));
  insert into users(id, school_id, role, full_name, email) values
    (v_student, v_school_a, 'student',   'Stu',  concat(v_student, '@test.dev')),
    (v_org_a,   v_school_a, 'organizer', 'OrgA', concat(v_org_a, '@test.dev')),
    (v_org_c,   v_school_c, 'organizer', 'OrgC', concat(v_org_c, '@test.dev'));
  insert into exchanges(id, name, year, school_a_id, school_b_id)
    values (v_exchange, 'H2 Ex', 2026, v_school_a, v_school_b);
  insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_student);

  -- Impersonate the OUTSIDE organizer (school C)
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_c, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from exchange_enrollments where exchange_id = v_exchange;
  if n <> 0 then raise exception 'H2 FAIL: outside organizer read % enrollment rows', n; end if;

  begin
    insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_org_c);
    raise exception 'H2 FAIL: outside organizer inserted an enrollment';
  exception when sqlstate '42501' then null; end;

  reset role;

  -- Impersonate the PARTICIPATING organizer (school A)
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from exchange_enrollments where exchange_id = v_exchange;
  if n <> 1 then raise exception 'H2 FAIL: participating organizer saw % rows (expected 1)', n; end if;
  reset role;

  raise exception 'ROLLBACK_OK: H2 assertions passed';
end $$;
```

- [ ] **Step 2: Run the test to verify it fails (vulnerability present)**

Run via `execute_sql`.
Expected: raises **`H2 FAIL: outside organizer read 1 enrollment rows`** (current policy lets any organizer read all enrollments).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260628000003_scope_enrollment_policies.sql`:

```sql
-- H2: enrollment policies were gated only by organizer role, exposing every
-- school's enrollments to every organizer (read) and allowing cross-tenant
-- inserts. Scope them to exchanges the caller's school participates in. The
-- helper is SECURITY DEFINER so the exchanges lookup inside the policy does not
-- recurse into the exchanges RLS policies (which themselves reference
-- exchange_enrollments).
create or replace function exchange_in_my_school(eid uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from exchanges e
    where e.id = eid
      and (e.school_a_id = my_school_id() or e.school_b_id = my_school_id())
  )
$$;

drop policy if exists "organizers read enrollments" on exchange_enrollments;
create policy "organizers read enrollments" on exchange_enrollments for select
  using (my_role() = 'organizer' and exchange_in_my_school(exchange_id));

drop policy if exists "organizers insert enrollments" on exchange_enrollments;
create policy "organizers insert enrollments" on exchange_enrollments for insert
  with check (my_role() = 'organizer' and exchange_in_my_school(exchange_id));
```

- [ ] **Step 4: Apply the migration**

Apply via Supabase MCP `apply_migration`, name `20260628000003_scope_enrollment_policies`.

- [ ] **Step 5: Run the test to verify it passes**

Run `supabase/tests/h2_enrollment_scope.test.sql`.
Expected: **`ROLLBACK_OK: H2 assertions passed`**, no `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260628000003_scope_enrollment_policies.sql supabase/tests/h2_enrollment_scope.test.sql
git commit -m "fix(security): scope exchange_enrollments policies to participating school (H2)"
```

---

### Task 5: Full regression + smoke verification

Confirm nothing in the normal flows regressed and the whole suite is green.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS, including `actions/__tests__/forms.test.ts` and the existing `submissions.test.ts` / `utils.test.ts`.

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Re-run all three RLS scripts via the Supabase MCP**

Run, in order, via `execute_sql`:
- `supabase/tests/c1_submission_review.test.sql` → `ROLLBACK_OK: C1 assertions passed`
- `supabase/tests/h1_child_table_policies.test.sql` → `ROLLBACK_OK: H1 assertions passed`
- `supabase/tests/h2_enrollment_scope.test.sql` → `ROLLBACK_OK: H2 assertions passed`

- [ ] **Step 4: Positive-path smoke check (no migration applied to anything; reads only)**

Confirm the legitimate flows still work end-to-end in the running app (`pnpm dev`), signed in as an organizer:
1. Open a form template's edit page — fields/slots load (exercises `getTemplate`).
2. Add and remove a field — succeeds (exercises `addField`/`removeField` + H1 policies).
3. Open the exchange grid and the students page — enrollments and students load (exercises the H2 read policy via `getExchangeGrid` / `getExchangeStudents`).
4. Approve a submitted form — status flips to approved (exercises the C1 trigger's organizer path).

Expected: all four succeed with no errors.

- [ ] **Step 5: Confirm Supabase security advisors show no new criticals**

Run the Supabase MCP `get_advisors` (type `security`). Expected: the C1/H1/H2 issues are gone; `exchange_in_my_school` may appear as a new `anon/authenticated EXECUTE` advisor (same class as the existing helpers — this is finding L1, deferred to a later pass, and is required for the policy to evaluate). No new error-level findings.

---

## Out of scope (deferred to a later hardening pass)

These audit findings are intentionally **not** addressed here: M1 (file-upload validation), M2 (edge-function cron auth), M3 (`search_path` on `my_role`/`my_school_id`/`update_updated_at`), L1 (revoke EXECUTE on helper functions), L2 (foreign field/slot attachment), L3 (leaked-password protection), L4 (invite email validation), L5 (answer length limits), and H3 (secret rotation — an operational step done at deploy time, not a code change).
