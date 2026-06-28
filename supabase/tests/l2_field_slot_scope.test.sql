-- L2: a student cannot attach a field_answer / document_upload that references a
-- DIFFERENT template's field/slot to their own submission; the matching
-- (same-template) field/slot is still allowed. Fixtures roll back.
-- PASS = "ROLLBACK_OK"; FAIL = a message containing "FAIL".
do $$
declare
  v_school_a uuid := gen_random_uuid(); v_school_b uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid(); v_org uuid := gen_random_uuid();
  v_exchange uuid := gen_random_uuid();
  v_t1 uuid := gen_random_uuid(); v_t2 uuid := gen_random_uuid();
  v_f1 uuid := gen_random_uuid(); v_f2 uuid := gen_random_uuid();
  v_s1 uuid := gen_random_uuid(); v_s2 uuid := gen_random_uuid();
  v_assignment uuid; v_submission uuid;
begin
  insert into schools(id, name) values (v_school_a, 'L2 A'), (v_school_b, 'L2 B');
  insert into auth.users(id, instance_id, aud, role, email) values
    (v_student, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_student, '@test.dev')),
    (v_org,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org, '@test.dev'));
  insert into users(id, school_id, role, full_name, email) values
    (v_student, v_school_a, 'student', 'Stu', concat(v_student, '@test.dev')),
    (v_org,     v_school_a, 'organizer', 'Org', concat(v_org, '@test.dev'));
  insert into exchanges(id, name, year, school_a_id, school_b_id) values (v_exchange, 'L2 Ex', 2026, v_school_a, v_school_b);
  insert into form_templates(id, exchange_id, school_id, name, type, deadline, created_by) values
    (v_t1, v_exchange, v_school_a, 'T1', 'data_entry', current_date + 7, v_org),
    (v_t2, v_exchange, v_school_a, 'T2', 'data_entry', current_date + 7, v_org);
  insert into form_fields(id, template_id, label, field_type, required, "order") values
    (v_f1, v_t1, 'F1', 'text', false, 0),
    (v_f2, v_t2, 'F2', 'text', false, 0);
  insert into document_slots(id, template_id, label, description, required, "order") values
    (v_s1, v_t1, 'S1', null, false, 0),
    (v_s2, v_t2, 'S2', null, false, 0);
  -- enrollment auto-assigns both same-school templates; submission is on T1
  insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_student);
  select id into v_assignment from assignments where template_id = v_t1 and student_id = v_student;
  if v_assignment is null then raise exception 'L2 SETUP FAIL: T1 assignment not created'; end if;
  insert into submissions(assignment_id, status) values (v_assignment, 'draft') returning id into v_submission;

  -- Impersonate the STUDENT
  perform set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- foreign field (belongs to T2) attached to a T1 submission -> blocked
  begin
    insert into field_answers(submission_id, field_id, value) values (v_submission, v_f2, 'x');
    raise exception 'L2 FAIL: student attached a foreign template field';
  exception when sqlstate '42501' then null; end;

  -- own-template field is allowed
  insert into field_answers(submission_id, field_id, value) values (v_submission, v_f1, 'ok');

  -- foreign slot (belongs to T2) attached to a T1 submission -> blocked
  begin
    insert into document_uploads(submission_id, slot_id, storage_path, file_name)
      values (v_submission, v_s2, concat(v_assignment, '/', v_s2, '/x.pdf'), 'x.pdf');
    raise exception 'L2 FAIL: student attached a foreign template slot';
  exception when sqlstate '42501' then null; end;

  -- own-template slot is allowed
  insert into document_uploads(submission_id, slot_id, storage_path, file_name)
    values (v_submission, v_s1, concat(v_assignment, '/', v_s1, '/x.pdf'), 'x.pdf');

  reset role;
  raise exception 'ROLLBACK_OK: L2 assertions passed';
end $$;
