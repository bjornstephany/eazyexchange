-- Enable RLS on all tables
alter table schools enable row level security;
alter table users enable row level security;
alter table exchanges enable row level security;
alter table exchange_enrollments enable row level security;
alter table form_templates enable row level security;
alter table form_fields enable row level security;
alter table document_slots enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table field_answers enable row level security;
alter table document_uploads enable row level security;

-- Helper: get current user's school_id
create or replace function my_school_id() returns uuid language sql security definer as $$
  select school_id from users where id = auth.uid()
$$;

-- Helper: get current user's role
create or replace function my_role() returns text language sql security definer as $$
  select role from users where id = auth.uid()
$$;

-- schools: anyone authenticated can read their own school
create policy "users can read their school" on schools for select
  using (id = my_school_id());

-- users: organizers read all users in their school; students read themselves
create policy "organizers read school users" on users for select
  using (my_role() = 'organizer' and school_id = my_school_id());
create policy "students read themselves" on users for select
  using (id = auth.uid());
create policy "users update themselves" on users for update
  using (id = auth.uid());

-- exchanges: organizers in either school can read
create policy "organizers read exchanges" on exchanges for select
  using (my_role() = 'organizer' and (school_a_id = my_school_id() or school_b_id = my_school_id()));
create policy "organizers insert exchanges" on exchanges for insert
  with check (my_role() = 'organizer' and (school_a_id = my_school_id() or school_b_id = my_school_id()));

-- exchange_enrollments
create policy "organizers read enrollments" on exchange_enrollments for select
  using (my_role() = 'organizer');
create policy "students read own enrollment" on exchange_enrollments for select
  using (user_id = auth.uid());
create policy "organizers insert enrollments" on exchange_enrollments for insert
  with check (my_role() = 'organizer');

-- form_templates: organizers from the template's school; enrolled students
create policy "organizers manage their templates" on form_templates for all
  using (my_role() = 'organizer' and school_id = my_school_id());
create policy "students read assigned templates" on form_templates for select
  using (
    my_role() = 'student' and
    exists (
      select 1 from assignments a where a.template_id = form_templates.id and a.student_id = auth.uid()
    )
  );

-- form_fields
create policy "organizers manage fields" on form_fields for all
  using (exists (select 1 from form_templates ft where ft.id = form_fields.template_id and ft.school_id = my_school_id()));
create policy "students read fields for assigned templates" on form_fields for select
  using (exists (select 1 from assignments a where a.template_id = form_fields.template_id and a.student_id = auth.uid()));

-- document_slots (same pattern as form_fields)
create policy "organizers manage slots" on document_slots for all
  using (exists (select 1 from form_templates ft where ft.id = document_slots.template_id and ft.school_id = my_school_id()));
create policy "students read slots for assigned templates" on document_slots for select
  using (exists (select 1 from assignments a where a.template_id = document_slots.template_id and a.student_id = auth.uid()));

-- assignments
create policy "organizers manage assignments" on assignments for all
  using (exists (select 1 from form_templates ft where ft.id = assignments.template_id and ft.school_id = my_school_id()));
create policy "students read own assignments" on assignments for select
  using (student_id = auth.uid());

-- submissions
create policy "organizers read school submissions" on submissions for select
  using (my_role() = 'organizer' and exists (
    select 1 from assignments a
    join form_templates ft on ft.id = a.template_id
    where a.id = submissions.assignment_id and ft.school_id = my_school_id()
  ));
create policy "organizers update submission status" on submissions for update
  using (my_role() = 'organizer' and exists (
    select 1 from assignments a
    join form_templates ft on ft.id = a.template_id
    where a.id = submissions.assignment_id and ft.school_id = my_school_id()
  ));
create policy "students manage own submissions" on submissions for all
  using (exists (select 1 from assignments a where a.id = submissions.assignment_id and a.student_id = auth.uid()));

-- field_answers
create policy "organizers read answers" on field_answers for select
  using (my_role() = 'organizer' and exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    join form_templates ft on ft.id = a.template_id
    where s.id = field_answers.submission_id and ft.school_id = my_school_id()
  ));
create policy "students manage own answers" on field_answers for all
  using (exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    where s.id = field_answers.submission_id and a.student_id = auth.uid()
  ));

-- document_uploads (same pattern as field_answers)
create policy "organizers read uploads" on document_uploads for select
  using (my_role() = 'organizer' and exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    join form_templates ft on ft.id = a.template_id
    where s.id = document_uploads.submission_id and ft.school_id = my_school_id()
  ));
create policy "students manage own uploads" on document_uploads for all
  using (exists (
    select 1 from submissions s join assignments a on a.id = s.assignment_id
    where s.id = document_uploads.submission_id and a.student_id = auth.uid()
  ));
