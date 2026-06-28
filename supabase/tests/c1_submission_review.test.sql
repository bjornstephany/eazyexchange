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
