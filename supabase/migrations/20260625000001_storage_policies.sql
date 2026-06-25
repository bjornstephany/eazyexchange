-- Storage bucket + RLS for student document uploads.
--
-- Object keys are structured as:  <assignment_id>/<slot_id>/<uuid>-<filename>
-- so (storage.foldername(name))[1] is the assignment_id. Access is scoped off
-- that assignment: the owning student manages their files; organizers of the
-- school that owns the assignment's form template can read them.

-- Private bucket (no public access; downloads go through signed URLs / the API)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- RLS is enabled on storage.objects by default in Supabase.

-- Students: full control over files under their own assignments
create policy "students manage own assignment files" on storage.objects
  for all
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from assignments a
      where a.id::text = (storage.foldername(name))[1]
        and a.student_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from assignments a
      where a.id::text = (storage.foldername(name))[1]
        and a.student_id = auth.uid()
    )
  );

-- Organizers: read files for assignments whose form template belongs to their school
create policy "organizers read school assignment files" on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and my_role() = 'organizer'
    and exists (
      select 1 from assignments a
      join form_templates ft on ft.id = a.template_id
      where a.id::text = (storage.foldername(name))[1]
        and ft.school_id = my_school_id()
    )
  );
