-- ============================================================
-- Storage Bucket Setup — Must be applied manually via dashboard
-- or via CLI with a live Supabase project connection.
-- ============================================================
--
-- Step 1: Create the bucket
-- --------------------------
-- Via Supabase Dashboard:
--   Storage → New bucket
--   Name:   documents
--   Public: No (private)
--
-- Via CLI (requires live project link):
--   pnpm supabase storage create documents --no-public
--
--
-- Step 2: Add storage RLS policies
-- ----------------------------------
-- Apply these in Supabase Dashboard → Storage → Policies
-- (or via SQL editor after the bucket exists):

-- Students can upload to their own submission folder
create policy "students upload own docs" on storage.objects for insert
  with check (
    bucket_id = 'documents' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Students can read their own uploads
create policy "students read own docs" on storage.objects for select
  using (
    bucket_id = 'documents' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Organizers can read docs from their school's submissions
-- (Simplified: organizers read all — tighten post-MVP if needed)
create policy "organizers read docs" on storage.objects for select
  using (bucket_id = 'documents' and my_role() = 'organizer');
