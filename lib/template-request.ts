// Constraints for « Vous ne trouvez pas votre modèle ? » — the organizer sends
// us the application form they already use and we add it to the library.
//
// Deliberately NOT lib/uploads.ts's list, which governs student document slots
// and applicant photos: widening that one to admit .doc/.docx would loosen a
// storage-backed path that has its own bucket-level mime allowlist. This file
// is the only place these limits live, and both the dialog and the server
// action read them from here.
//
// There is no bucket and no stored object: the file travels as a Resend
// attachment to FEEDBACK_EMAIL and is never persisted by us. That is what keeps
// the cap low.

export const TEMPLATE_REQUEST_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
] as const

// Well under the 4 MB `serverActions.bodySizeLimit` in next.config.mjs — the
// multipart body carries the file plus the note, and a request that exceeds the
// limit is rejected by the framework with no structured outcome to show.
export const TEMPLATE_REQUEST_MAX_BYTES = 3 * 1024 * 1024

export const TEMPLATE_REQUEST_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'

export const TEMPLATE_REQUEST_NOTE_MAX = 1000

// The outcome as a code; the dialog maps it to `organizer.applications.setup.*`
// copy in five locales, so no message crosses this boundary.
export type TemplateRequestIssue = 'missing_file' | 'unsupported_type' | 'too_large'

export function templateRequestFileIssue(
  file: { type: string; size: number } | null,
): TemplateRequestIssue | null {
  if (!file || file.size === 0) return 'missing_file'
  if (!(TEMPLATE_REQUEST_MIME_TYPES as readonly string[]).includes(file.type)) return 'unsupported_type'
  if (file.size > TEMPLATE_REQUEST_MAX_BYTES) return 'too_large'
  return null
}
