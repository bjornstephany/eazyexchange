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
