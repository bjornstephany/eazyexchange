-- L2: the student policies on field_answers / document_uploads checked only that
-- the submission belongs to the student, not that the field/slot belongs to that
-- submission's template. A student could therefore attach an answer/upload that
-- references another template's field/slot to their own submission (data
-- integrity). Add a WITH CHECK requiring the field/slot to share the submission's
-- template. SECURITY DEFINER helpers (like the existing ones) avoid RLS recursion.

create or replace function field_template(fid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select template_id from form_fields where id = fid
$$;

create or replace function slot_template(sid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select template_id from document_slots where id = sid
$$;

create or replace function submission_template(subid uuid) returns uuid
  language sql security definer stable set search_path = public as $$
  select a.template_id
  from submissions s join assignments a on a.id = s.assignment_id
  where s.id = subid
$$;

drop policy if exists "students manage own answers" on field_answers;
create policy "students manage own answers" on field_answers for all
  using (submission_student(submission_id) = auth.uid())
  with check (
    submission_student(submission_id) = auth.uid()
    and field_template(field_id) = submission_template(submission_id)
  );

drop policy if exists "students manage own uploads" on document_uploads;
create policy "students manage own uploads" on document_uploads for all
  using (submission_student(submission_id) = auth.uid())
  with check (
    submission_student(submission_id) = auth.uid()
    and slot_template(slot_id) = submission_template(submission_id)
  );
