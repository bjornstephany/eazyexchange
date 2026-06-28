-- H2: an organizer whose school is NOT part of an exchange cannot read or insert
-- its enrollments; an organizer of a participating school can. Fixtures roll back.
-- PASS = "ROLLBACK_OK"; FAIL = a message containing "FAIL".
do $$
declare
  v_school_a uuid := gen_random_uuid();  -- in the exchange
  v_school_b uuid := gen_random_uuid();  -- in the exchange
  v_school_c uuid := gen_random_uuid();  -- outside the exchange
  v_student  uuid := gen_random_uuid();  -- school A student
  v_student2 uuid := gen_random_uuid();  -- school A student (for enroll test)
  v_org_a    uuid := gen_random_uuid();  -- school A organizer
  v_org_c    uuid := gen_random_uuid();  -- school C organizer
  v_exchange uuid := gen_random_uuid();  -- A <-> B
  n int;
begin
  insert into schools(id, name) values (v_school_a, 'H2 A'), (v_school_b, 'H2 B'), (v_school_c, 'H2 C');
  insert into auth.users(id, instance_id, aud, role, email) values
    (v_student,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_student, '@test.dev')),
    (v_student2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_student2, '@test.dev')),
    (v_org_a,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org_a, '@test.dev')),
    (v_org_c,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', concat(v_org_c, '@test.dev'));
  insert into users(id, school_id, role, full_name, email) values
    (v_student,  v_school_a, 'student',   'Stu',  concat(v_student, '@test.dev')),
    (v_student2, v_school_a, 'student',   'Stu2', concat(v_student2, '@test.dev')),
    (v_org_a,    v_school_a, 'organizer', 'OrgA', concat(v_org_a, '@test.dev')),
    (v_org_c,    v_school_c, 'organizer', 'OrgC', concat(v_org_c, '@test.dev'));
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

  -- org_a MAY enroll a student of its own school
  insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_student2);  -- must succeed

  -- org_a may NOT enroll a user outside its school (v_org_c is a school-C user)
  begin
    insert into exchange_enrollments(exchange_id, user_id) values (v_exchange, v_org_c);
    raise exception 'H2 FAIL: organizer enrolled a user outside its school';
  exception when sqlstate '42501' then null; end;

  reset role;

  raise exception 'ROLLBACK_OK: H2 assertions passed';
end $$;
