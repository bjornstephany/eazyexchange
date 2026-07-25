// Shared upload constraints for student document uploads (audit finding M1).
//
// The DATABASE is the real enforcement boundary: the `documents` bucket is
// configured with allowed_mime_types + file_size_limit (see migration
// 20260628000007), so Supabase Storage rejects bad uploads server-side
// regardless of the client. The checks here run client-side for fast UX
// feedback and to drive the file input's `accept` attribute.
//
// SVG is intentionally excluded — it can carry executable script and would be a
// stored-XSS vector when an organizer opens it.

export const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

// Value for an <input type="file"> `accept` attribute.
export const ALLOWED_UPLOAD_ACCEPT = ALLOWED_UPLOAD_MIME_TYPES.join(',')

// The outcome as a code, for callers that report through their own copy layer
// (the localized application funnel maps these to `apply.errors.*`).
export function uploadFileIssue(
  file: { type: string; size: number },
): 'unsupported_type' | 'too_large' | null {
  if (!(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) return 'unsupported_type'
  if (file.size > MAX_UPLOAD_BYTES) return 'too_large'
  return null
}

// Returns a human-readable error message if the file is not allowed, or null if
// it passes. Takes the minimal shape so it's trivially unit-testable. Kept for
// the organizer-facing document slots, which surface the string directly.
export function validateUploadFile(file: { type: string; size: number }): string | null {
  const issue = uploadFileIssue(file)
  if (issue === 'unsupported_type') {
    return 'Unsupported file type. Please upload a PDF, JPEG, PNG, or WebP file.'
  }
  if (issue === 'too_large') {
    return 'File is too large. Maximum size is 10 MB.'
  }
  return null
}

// Private bucket for applicant photos (see migration
// 20260629000002_application_photos_bucket.sql).
export const APPLICATION_PHOTO_BUCKET = 'application-photos'

// Photo picker accept list — images only. ALLOWED_UPLOAD_ACCEPT above is for
// document slots and includes PDF, which is wrong for a portrait photo.
export const ALLOWED_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
