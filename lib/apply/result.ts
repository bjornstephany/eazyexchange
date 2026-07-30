// Shared contract for the anonymous application funnel's *expected* outcomes.
//
// Every action in actions/apply.ts is reached by a parent or a 15-year-old
// through a public token link. Next.js replaces thrown Server Action messages
// with an opaque digest in production, so a throw on an expected outcome shows
// them a hex string with no way to recover. These all travel as return values.
//
// Lives outside the 'use server' module because such a module may only export
// async functions — the client components import the codes from here. Same
// pattern as lib/invite-response.ts and lib/team/join-result.ts.
//
// The action returns a CODE, never a sentence: the funnel is localized in five
// languages and the copy lives in the next-intl catalogues under `apply.errors`.

export type ApplyFailureReason =
  // Token / row lifecycle
  | 'not_found'       // the resume token matches no application
  | 'expired'         // resume_token_expires_at is past
  | 'locked'          // already submitted — no longer editable
  | 'closed'          // the exchange stopped accepting applications
  // Abuse guards
  | 'rate_limited'    // per-IP or per-email cap hit
  // Content validation
  | 'too_long'        // one or more answers exceed MAX_ANSWER_LENGTH
  | 'bad_format'      // malformed e-mail / phone in a flagged field
  | 'missing_fields'  // required answers still blank at submit
  | 'registered'      // this e-mail is already enrolled elsewhere in the school
  // Photo upload
  | 'no_file'         // the form arrived without a file part
  | 'not_an_image'    // a non-image (e.g. PDF) was chosen for the portrait
  | 'file_rejected'   // unsupported type or over the 10 MB cap
  | 'photo_disabled'  // this exchange's questionnaire no longer asks for a portrait
  // Genuinely unexpected, surfaced rather than thrown
  | 'failed'

export type ApplyFailure = {
  ok: false
  reason: ApplyFailureReason
  // Field keys the client should highlight (too_long / bad_format / missing_fields).
  fields?: string[]
}

export type ApplyWriteResult = { ok: true } | ApplyFailure
export type ApplyPhotoResult = { ok: true; path: string } | ApplyFailure

export function applyFailure(reason: ApplyFailureReason, fields?: string[]): ApplyFailure {
  return fields && fields.length > 0 ? { ok: false, reason, fields } : { ok: false, reason }
}
