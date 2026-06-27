-- Keep assignments in sync automatically. A student is assigned a template iff
-- they are enrolled in the template's exchange, belong to the template's school,
-- and have role 'student'. Two AFTER INSERT triggers maintain this in both
-- directions; a one-time backfill closes the existing gap.
--
-- SECURITY DEFINER so the inner insert into assignments is not blocked by RLS,
-- regardless of which user triggered it (matches the helper-fn pattern in
-- 20260625000005_fix_rls_recursion.sql).
--
-- Scope: INSERT-only. This maintains assignments when templates or enrollments
-- are created. It does NOT re-sync on UPDATE of a user's school_id or a
-- template's exchange_id/school_id — no code path mutates those columns today.

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

drop trigger if exists trg_assign_on_template_insert on form_templates;
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

drop trigger if exists trg_assign_on_enrollment_insert on exchange_enrollments;
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
