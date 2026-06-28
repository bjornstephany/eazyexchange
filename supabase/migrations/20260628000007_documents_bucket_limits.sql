-- M1: enforce a MIME allowlist and size cap on the `documents` storage bucket.
-- This is the real boundary — the client-side checks in DocumentUploadForm are
-- UX only and can be bypassed. Supabase Storage rejects an upload whose declared
-- content-type is not in allowed_mime_types or whose size exceeds
-- file_size_limit.
--
-- Allowed: PDF + common raster images. SVG is intentionally excluded (it can
-- carry script → stored-XSS when an organizer opens it).
update storage.buckets
set file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'documents';
