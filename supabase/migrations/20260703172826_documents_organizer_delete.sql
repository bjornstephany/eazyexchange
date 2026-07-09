-- Fix: deleteTemplate's storage cleanup (actions/forms.ts) calls
-- supabase.storage.from('documents').remove(paths) but organizers only had
-- a SELECT policy on storage.objects for the documents bucket. Under RLS,
-- remove() silently filters out objects the caller can't delete and still
-- reports success — so template deletion was leaving orphaned files in
-- storage. Add a DELETE policy scoped identically to the existing organizer
-- read policy ("organizers read school assignment files" in
-- 20260625000001_storage_policies.sql).

create policy "organizers delete school assignment files" on storage.objects
  for delete
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
