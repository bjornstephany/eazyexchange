-- Private bucket for the applicant photo. The public application path uploads via
-- the service-role admin client (no auth user), and organizers read via a
-- service-role-signed URL after an explicit school-ownership check in
-- actions/applications.ts. No anon/authenticated storage policies are granted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-photos', 'application-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public = excluded.public;
