# Applications Page Polish — Design

**Date:** 2026-07-17
**Status:** Approved by Bjorn (brainstorming session)

Three usability fixes on the organizer Applications page and the public apply form:

1. Student photo shown in each application row.
2. 150-character limit on the open-ended "Student profile" questions.
3. Light-gray reading text made dark and readable.

No migration, no RLS change, no new admin-allowlist entry.

## 1. Student photos in application rows

**Files:** `actions/applications-review.ts`, `app/(organizer)/applications/page.tsx`,
`components/applications/CandidaturesView.tsx`, `lib/dashboard/rollup.ts`

- `listApplications(exchangeId, opts?)` gains an option `{ withPhotos: true }`
  (default off). When set, the query also selects `photo_path`, and after the
  RLS-scoped fetch the action batch-signs all non-null paths in **one** storage
  call: `admin.storage.from(APPLICATION_PHOTO_BUCKET).createSignedUrls(paths, 3600)`.
  This reuses the exact authorization-then-admin-sign pattern already used by
  `getApplicationForReview` in the same file (bucket is private; the file is
  already on the admin allowlist). `photo_path` itself is not returned to the
  browser — only the signed URL.
- The applications page (`page.tsx`) passes the option; the dashboard's existing
  `listApplications` calls don't and are unaffected.
- `AppRow` (in `lib/dashboard/rollup.ts`) gains **optional** `photoUrl?: string | null`
  so dashboard rollup code is untouched.
- Row UI in `CandidaturesView`: a 28px round avatar (`rounded-full object-cover`)
  at the start of the student cell, before the name. Fallback when there is no
  photo or signing failed: the student's initials (first letter of first + last
  name; fall back to the first letter of the email when both are empty) on a
  subtle background circle. Photos are mandatory at submit, so the fallback
  mostly covers legacy rows.

## 2. 150-character limit on open-ended questions

**Files:** `lib/application-form.ts`, `components/ApplicationForm.tsx`, `actions/apply.ts`

- `AppField` gains optional `maxLength?: number`. Set `maxLength: 150` on the
  14 textareas of the **`profile` section only** (`lived_abroad` …
  `anything_else`). Addresses, food requirements, and allergy fields stay
  unlimited.
- Client (`ApplicationForm`): render the `maxLength` attribute on those
  textareas and a small live character counter (`97/150`) so applicants are not
  silently cut off.
- Server: a new pure helper in `lib/application-form.ts`,
  `overLimitApplicationFields(data): string[]`, returns the ids of fields whose
  value exceeds their `maxLength`. `saveApplication` and `submitApplication`
  in `actions/apply.ts` call it and reject over-limit payloads with a
  **structured return value** (project pattern — never a thrown error for an
  expected outcome), which the form surfaces like other validation misses.
- Already-submitted applications are never re-validated; existing long answers
  remain stored and readable in the review view.

## 3. Dark, readable text

**Files:** `components/applications/CandidaturesView.tsx`, `components/ApplicationReadView.tsx`

- Table rows: the level, native language, and received-date cells change from
  `text-muted-foreground` to the same dark navy as the student name
  (`text-navy`).
- Detail view (`ApplicationReadView`): question labels change from
  `text-xs text-muted-foreground` to dark (`text-foreground`), keeping
  hierarchy via size/weight (labels stay `text-xs`, answers `text-sm`).
- Structural chrome stays muted: column headers (mono uppercase), empty states,
  bulk-bar text, and control labels ("Deadline", "Link") are not reading
  content and keep their current styling. The trailing `›` chevron stays muted.

## Testing

- Unit tests for `overLimitApplicationFields` (under, at, over limit; fields
  without `maxLength` ignored).
- Unit test for the photo-URL mapping in `listApplications` (paths → signed
  URLs, null path → null URL) at whatever seam is already mocked in existing
  action tests.
- Component render test: avatar shows initials fallback when `photoUrl` is null.
- Gate: `pnpm lint`, `pnpm test`, `pnpm build`. No `test:rls` needed (no
  migration/RLS/storage-policy change).
