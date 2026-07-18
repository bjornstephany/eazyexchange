# Élèves tab: render student application photos

**Date:** 2026-07-18
**Status:** Approved

## Goal

The photo a student uploaded with their application already renders on the
Candidatures page (rows + detail). Render the same photo on the Élèves tab
too — in the left-hand list rows **and** in the larger avatar at the top of
the student detail panel — falling back to the existing colored-initials
circle when there is no photo.

## Current state

- `getStudentsDirectory` (`actions/students.ts`) already joins each enrolled
  student to their application via `applications.enrolled_user_id`, selecting
  `id, enrolled_user_id, data` — but not `photo_path`.
- `listApplications` (`actions/applications-review.ts`) is the reference
  pattern: it selects `photo_path`, batch-creates 1-hour signed URLs from the
  applications storage bucket, and ships `photoUrl` to the client.
- The Élèves tab (`components/students/StudentsView.tsx`,
  `components/students/StudentDetail.tsx`) renders initials circles from
  `StudentVM.initials` / `StudentVM.avatarBg`
  (`lib/students/directory.ts`).

## Design

### Data — `actions/students.ts` (`getStudentsDirectory`)

- Add `photo_path` to the applications select.
- Batch-sign the non-null paths with the same signed-URL pattern
  `listApplications` uses (same bucket, 1-hour expiry, one batch call).
- Pass `photoUrl: string | null` into `buildStudentVM` (null when the student
  has no linked application, no photo, or signing failed).

### View-model — `lib/students/directory.ts`

- `StudentVM` gains `photoUrl: string | null`.
- `initials` and `avatarBg` are unchanged and remain the fallback.

### UI

- `StudentsView.tsx` list row: when `photoUrl` is set, render a 36px round
  `<img>` (`object-cover`, empty `alt` — the name is rendered right next to
  it, matching the `ApplicantAvatar` convention); otherwise the existing
  initials circle.
- `StudentDetail.tsx`: same conditional on the larger detail-panel avatar,
  keeping its current size.
- `ApplicantAvatar` is **not** reused: it is hard-coded to 28px and to the
  application-data initials helper, while the directory has its own initials
  and color palette. A small local conditional in each component is simpler.

## Out of scope

- No schema migration, no RLS change (the action already reads these
  application rows), no storage change.
- No change to the Candidatures page or to how photos are uploaded.

## Testing

- `buildStudentVM` unit test: `photoUrl` passes through; null when absent.
- `StudentsView` test: row renders an `<img>` when `photoUrl` is set,
  initials circle when null.
- `StudentDetail` test: same assertion for the detail avatar.
- Gate: `pnpm lint`, `pnpm test`, build/type check. `pnpm test:rls` not
  required (no migration/RLS/bucket change).
