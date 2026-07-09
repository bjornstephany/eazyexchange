-- Fix: in "organizers read school assignment files" (20260625000001) and
-- "organizers delete school assignment files" (20260703000002), the EXISTS
-- subquery joins form_templates ft, whose `name` column captures the
-- unqualified `name` reference (inner scope wins over storage.objects.name).
-- The deployed quals therefore compute storage.foldername(ft.name) — the
-- template's display name, never a path — so the policies never match:
-- organizers could not read (signed-URL) or delete families' uploads.
-- Recreate both with the object column explicitly qualified, matching the
-- student policies which already use objects.name.

drop policy "organizers read school assignment files" on storage.objects;
create policy "organizers read school assignment files" on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and my_role() = 'organizer'
    and exists (
      select 1 from assignments a
      join form_templates ft on ft.id = a.template_id
      where a.id::text = (storage.foldername(objects.name))[1]
        and ft.school_id = my_school_id()
    )
  );

drop policy "organizers delete school assignment files" on storage.objects;
create policy "organizers delete school assignment files" on storage.objects
  for delete
  using (
    bucket_id = 'documents'
    and my_role() = 'organizer'
    and exists (
      select 1 from assignments a
      join form_templates ft on ft.id = a.template_id
      where a.id::text = (storage.foldername(objects.name))[1]
        and ft.school_id = my_school_id()
    )
  );
