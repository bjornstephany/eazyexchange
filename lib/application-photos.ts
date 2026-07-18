import { createAdminClient } from '@/lib/supabase/admin'
import { APPLICATION_PHOTO_BUCKET } from '@/lib/uploads'

// Batch-sign application photo storage paths (1 h expiry) with the
// service-role client: the application-photos bucket is private with no
// per-user storage policy, so every CALLER must have verified organizer
// scope on the rows before handing paths in. Returns path → signed URL;
// failed/missing entries are simply absent.
export async function signApplicationPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const urlByPath = new Map<string, string>()
  if (paths.length === 0) return urlByPath
  const admin = createAdminClient()
  const { data } = await admin.storage
    .from(APPLICATION_PHOTO_BUCKET)
    .createSignedUrls(paths, 3600)
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl)
  }
  return urlByPath
}
