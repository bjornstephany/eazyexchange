-- Fix infinite RLS recursion (Postgres 42P17).
--
-- The initial policies cross-referenced each other: form_templates' student
-- policy subqueries assignments, and assignments' organizer policy subqueries
-- form_templates — a cycle that also tainted form_fields, document_slots,
-- submissions, field_answers, and document_uploads. Any read/write of those
-- tables aborted with "infinite recursion detected in policy".
--
-- Route every cross-table check through SECURITY DEFINER helpers (like the
-- existing my_role()/my_school_id()). Being owned by the table owner, they
-- bypass RLS on the inner table, so policies never re-enter a protected table.

create or replace function template_school(tid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select school_id from form_templates where id = tid
$$;

create or replace function has_assignment(tid uuid) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from assignments where template_id = tid and student_id = auth.uid()
  )
$$;

create or replace function assignment_student(aid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select student_id from assignments where id = aid
$$;

create or replace function assignment_school(aid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select ft.school_id
  from assignments a join form_templates ft on ft.id = a.template_id
  where a.id = aid
$$;

create or replace function submission_student(sid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select a.student_id
  from submissions s join assignments a on a.id = s.assignment_id
  where s.id = sid
$$;

create or replace function submission_school(sid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select ft.school_id
  from submissions s
    join assignments a on a.id = s.assignment_id
    join form_templates ft on ft.id = a.template_id
  where s.id = sid
$$;

-- form_templates
drop policy if exists "students read assigned templates" on form_templates;
create policy "students read assigned templates" on form_templates for select
  using (my_role() = 'student' and has_assignment(id));

-- form_fields
drop policy if exists "organizers manage fields" on form_fields;
create policy "organizers manage fields" on form_fields for all
  using (template_school(template_id) = my_school_id());
drop policy if exists "students read fields for assigned templates" on form_fields;
create policy "students read fields for assigned templates" on form_fields for select
  using (has_assignment(template_id));

-- document_slots
drop policy if exists "organizers manage slots" on document_slots;
create policy "organizers manage slots" on document_slots for all
  using (template_school(template_id) = my_school_id());
drop policy if exists "students read slots for assigned templates" on document_slots;
create policy "students read slots for assigned templates" on document_slots for select
  using (has_assignment(template_id));

-- assignments
drop policy if exists "organizers manage assignments" on assignments;
create policy "organizers manage assignments" on assignments for all
  using (template_school(template_id) = my_school_id());

-- submissions
drop policy if exists "organizers read school submissions" on submissions;
create policy "organizers read school submissions" on submissions for select
  using (my_role() = 'organizer' and assignment_school(assignment_id) = my_school_id());
drop policy if exists "organizers update submission status" on submissions;
create policy "organizers update submission status" on submissions for update
  using (my_role() = 'organizer' and assignment_school(assignment_id) = my_school_id());
drop policy if exists "students manage own submissions" on submissions;
create policy "students manage own submissions" on submissions for all
  using (assignment_student(assignment_id) = auth.uid());

-- field_answers
drop policy if exists "organizers read answers" on field_answers;
create policy "organizers read answers" on field_answers for select
  using (my_role() = 'organizer' and submission_school(submission_id) = my_school_id());
drop policy if exists "students manage own answers" on field_answers;
create policy "students manage own answers" on field_answers for all
  using (submission_student(submission_id) = auth.uid());

-- document_uploads
drop policy if exists "organizers read uploads" on document_uploads;
create policy "organizers read uploads" on document_uploads for select
  using (my_role() = 'organizer' and submission_school(submission_id) = my_school_id());
drop policy if exists "students manage own uploads" on document_uploads;
create policy "students manage own uploads" on document_uploads for all
  using (submission_student(submission_id) = auth.uid());
