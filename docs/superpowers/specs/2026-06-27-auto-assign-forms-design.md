# Auto-assign forms via DB triggers

**Date:** 2026-06-27
**Status:** Approved (design)

## Problem

Form assignments to students happen in only one direction. When an organizer
**invites a student** (`inviteStudent` in `actions/students.ts`), the action
fans out assignments for all templates that already exist. But when an organizer
**creates a new form template** (`createTemplate` in `actions/forms.ts`) *after*
students are already enrolled, no assignments are created — those students never
see the new form.

Secondary issues found while investigating:

- The fan-out in `inviteStudent` (lines 66–77) **ignores the insert error**
  (`await supabase.from('assignments').upsert(...)` with no error check), so
  failures are silent.
- Production already has drift from this gap: **5 templates but only 3
  assignments** across 2 exchanges — existing students are missing forms now.

## Goal

A newly created form template is automatically assigned to every already-enrolled
student in that exchange, and a newly enrolled student is automatically assigned
every existing template — both directions, permanently, with no code path able to
bypass it.

## Key constraint: school scoping

Assignments are **school-scoped**. An exchange links two schools, each with its
own organizer and its own form templates. A student belongs to one school and is
assigned only *their own school's* templates for that exchange — never the
partner school's. The existing `inviteStudent` enforced this
(`.eq('school_id', profile.school_id)`); the new design must preserve it.

The rule, stated once:

> A student S is assigned template T **iff** S is enrolled in T's exchange AND
> S.school_id = T.school_id AND S.role = 'student'.

## Approach: database triggers

Chosen over application-code fan-out because it centralizes the rule in one place,
makes it impossible to forget on a future code path, runs atomically with the
triggering insert, and matches the project's DB-centric style (RLS policies,
`SECURITY DEFINER` helper functions, the `updated_at` trigger). It also lets us
delete the buggy fan-out code from `inviteStudent`.

### Components

All in one migration: `supabase/migrations/20260627000001_auto_assign_forms.sql`.

**1. `assign_students_to_new_template()` — `AFTER INSERT` on `form_templates`**

```sql
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
```

**2. `assign_templates_to_new_enrollment()` — `AFTER INSERT` on `exchange_enrollments`**

```sql
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
```

`SECURITY DEFINER` so the inner insert into `assignments` is not blocked by RLS
regardless of which user triggered it. `role = 'student'` guard prevents ever
assigning a form to an organizer. `ON CONFLICT (template_id, student_id) DO
NOTHING` relies on the existing `unique(template_id, student_id)` constraint and
makes re-invites idempotent.

**3. One-time backfill (same migration)**

```sql
insert into assignments (template_id, student_id)
select ft.id, u.id
from form_templates ft
join exchange_enrollments e on e.exchange_id = ft.exchange_id
join users u on u.id = e.user_id
where u.school_id = ft.school_id and u.role = 'student'
on conflict (template_id, student_id) do nothing;
```

**4. App-code cleanup — `actions/students.ts`**

Remove the fan-out block (current lines 66–77: the `form_templates` select and
the `assignments` upsert). The `exchange_enrollments` insert already present in
`inviteStudent` now triggers assignment creation. Ordering is safe: the profile
row is inserted (`admin.from('users').insert`, ~line 46) before the enrollment
insert (~line 59), so the enrollment trigger can read `users.school_id`. This
also removes the silently-swallowed error.

`createTemplate` (`actions/forms.ts`) needs **no change** — the template-insert
trigger covers it.

## Data flow

- Organizer creates template → `AFTER INSERT` on `form_templates` → assignments
  for all enrolled, same-school students of that exchange.
- Organizer invites student → profile row inserted → enrollment inserted →
  `AFTER INSERT` on `exchange_enrollments` → assignments for all existing
  same-school templates in that exchange.

## Error handling & edge cases

- A trigger failure raises and **rolls back** the triggering insert (template or
  enrollment) atomically — no partial/silent state.
- Template created in an exchange with no enrolled students yet → 0 rows inserted.
- Student invited when no templates exist yet → 0 rows inserted.
- Re-invite / duplicate enrollment → `ON CONFLICT DO NOTHING`.
- Template deletion cascades to assignments via the existing FK — unchanged.
- Un-enrollment is not a product feature; orphaned-assignment cleanup is out of
  scope.

## Testing / verification

- **Before/after assertion (the failing test):** a query counting missing
  `template × student` combinations (enrolled, same-school, role student, no
  assignment row) returns > 0 before the migration and must return **0** after.
- **Trigger behavior test:** a transactional SQL script — `BEGIN;` insert a
  template into an exchange with enrolled students, assert the matching
  assignments appear; insert an enrollment, assert assignments appear; `ROLLBACK;`
  — runnable via the Supabase CLI / psql.
- **End-to-end:** as organizer, create a form and confirm an already-enrolled
  student sees it in `/my-forms`; invite a new student and confirm they receive
  all existing same-school forms.

## Out of scope

- A "draft/publish" lifecycle for templates (assignment happens on create).
- Cross-school assignment.
- Un-enrollment and associated cleanup.
