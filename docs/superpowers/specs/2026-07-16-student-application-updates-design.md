# Student Application Updates — Design

**Date:** 2026-07-16
**Status:** Approved by Bjorn (design conversation), pending spec review

Four changes to the anonymous student application funnel (`/apply/[slug]` +
`/apply/resume/[token]`):

1. Gender becomes a radio choice (Male / Female / Other + specify).
2. Pronouns become a radio choice (He/him / She/her).
3. Photos of any size are accepted — the browser auto-compresses before upload.
4. After submission, the resume link shows a read-only recap of the answers.

**No database migration.** Answers live in the `applications.data` JSON column;
no schema, RLS, or storage-bucket change is required (`pnpm test:rls` not
triggered).

## 1. Gender field

In `lib/application-form.ts`, the `sex` field (currently `type: 'text'`)
becomes:

- `type: 'radio'`, label **Gender / Genre** (was Sex / Sexe), still required.
- Options (value → EN / FR label):
  - `male` → Male / Garçon
  - `female` → Female / Fille
  - `other` → Other / Autre
- The field id stays `sex` so already-submitted applications keep showing
  their legacy free-text answer in read views.

New conditional field `gender_other`:

- `type: 'text'`, label **Please specify / Précisez** (e.g. "male → female").
- Rendered directly below the gender field, only when `sex === 'other'`.
- Required **only** when `sex === 'other'` — enforced in both the client
  submit gate and the server-side `missingRequiredApplication` backstop,
  mirroring the existing `family_status` / `separation_housing_address`
  conditional pattern (`components/ApplicationForm.tsx:118,164` and
  `lib/application-form.ts:145-148`).

Legacy drafts whose `sex` holds free text simply render with no radio
selected; the student re-picks before submitting (the value is not migrated).

## 2. Pronouns field

Same file: `pronouns` becomes `type: 'radio'`, label unchanged
(Pronouns / Pronoms), still required. Options:

- `he_him` → He/him / Il
- `she_her` → She/her / Elle

No "other" option (per Bjorn).

### Read-view label mapping (targeted improvement)

`components/ApplicationReadView.tsx` currently prints raw stored values
(`married`, `yes`, …). Because this view is now shown to applicants (§4) as
well as organizers, it will map values to display labels:

- `radio` fields: look up the option whose `value` matches and render its
  bilingual label; fall back to the raw stored string when nothing matches
  (covers legacy free-text `sex` / `pronouns` answers).
- `yesno` fields: render Yes / No (Oui / Non) instead of the stored token.

## 3. Photo upload: auto-compress in the browser

**Finding:** the photo travels through the `uploadApplicationPhoto` server
action; Next.js caps server-action request bodies at **1 MB by default**
(nothing in `next.config.mjs` raises it) and Vercel caps request bodies at
~4.5 MB. Large photos therefore already fail today with the generic
"Upload failed", despite the advertised 10 MB. Rather than raising caps, the
design removes photo size as a user-facing concept.

- New client-side helper `lib/image-compression.ts`:
  - `compressImage(file: File): Promise<File>` — decode via
    `createImageBitmap(file, { imageOrientation: 'from-image' })` (handles
    EXIF rotation), downscale so the longest edge is ≤ 2000 px, re-encode to
    JPEG at ~0.85 quality via canvas `toBlob`. Output is typically
    300 KB–1 MB regardless of input size.
  - The dimension math (source size → target size) is a pure exported
    function, unit-tested; the DOM parts are thin.
  - Failure fallback: if decode/canvas fails (exotic file, old browser),
    return the original file when it is ≤ 3 MB, otherwise throw with a clear
    message (surfaced as the existing bilingual error line).
- `components/ApplicationPhotoUpload.tsx`:
  - Drop the size ceiling for photos — accept any size **image**; keep the
    type restriction (JPEG / PNG / WebP), switching the input's `accept`
    attribute to an image-only list (the current `ALLOWED_UPLOAD_ACCEPT` is
    shared with document uploads and wrongly offers PDF here; iOS converts
    HEIC to JPEG when picking from the photo library).
  - Compress, then upload the compressed file through the existing
    `uploadApplicationPhoto` server action (no change to its API).
  - Hint text: "JPEG, PNG or WebP — 10 MB max." → "Any photo — it will be
    resized automatically." / "N'importe quelle photo — elle sera
    redimensionnée automatiquement."
- `next.config.mjs`: set `experimental.serverActions.bodySizeLimit: '4mb'`
  as headroom for the compressed upload (stays under Vercel's ~4.5 MB cap).
- Untouched: document uploads (`lib/uploads.ts` `MAX_UPLOAD_BYTES` stays
  10 MB for PDFs etc.), the `application-photos` bucket limit (compressed
  photos are far below 10 MB), and the server action's
  `validateUploadFile` backstop.

## 4. Read-only recap after submission

Today `getResumeState` (`actions/apply.ts:160-192`) returns
`{ submitted: true }` once the application is no longer a draft, and
`app/apply/resume/[token]/page.tsx` shows an "already submitted" notice.

Change:

- `getResumeState`, in the submitted branch, additionally returns the stored
  `data`, the applicant's `language`, the exchange name, and a fresh signed
  photo URL (same 1 h signing already used for drafts).
- The resume page, when `submitted`, renders `ApplicationReadView` (with the
  §2 label mapping) under a banner: "Application submitted on «date»" /
  "Candidature envoyée le «date»", in the applicant's language.
- **Expiry semantics unchanged:** resume tokens expire 24 h after the
  application deadline (`resumeExpiry`); the recap is available until then
  and the expired notice takes over afterwards. Decided with Bjorn: a stale
  email link must not remain a long-lived door to a minor's PII.
- No new access path: the resume token remains the only credential, checks
  run before any data is returned, and the photo URL stays a short-lived
  signed URL from the private bucket.

## Error handling

- Compression failure: bilingual inline error under the photo card (existing
  `failed` slot), original-file fallback ≤ 3 MB.
- Oversized-after-fallback: clear bilingual message instead of a generic
  failure.
- Server action keeps throwing on invalid type/size (`validateUploadFile`)
  as backstop; expired/submitted token behavior in `getResumeState` is
  unchanged.

## Testing

Vitest, following existing test placement:

- `lib/__tests__/application-form.test.ts`: gender/pronoun option shapes;
  `missingRequiredApplication` requires `gender_other` iff `sex === 'other'`;
  unchanged behavior otherwise.
- New `lib/__tests__/image-compression.test.ts`: pure dimension math
  (landscape/portrait/small-image no-op cases).
- `components/__tests__/ApplicationForm.test.tsx`: `gender_other` visibility
  toggles with the gender radio.
- Read-view mapping: radio value renders its label; legacy free-text value
  falls back to raw string; yesno renders Oui/Non in FR.
- `actions/__tests__` (existing apply tests): submitted branch of
  `getResumeState` returns data + photo URL; expired token still returns the
  expired state.

Gate before commit/PR: `pnpm lint`, `pnpm test`, `npx tsc --noEmit`.

## Out of scope

- Migrating legacy free-text `sex`/`pronouns` values to the new option set.
- The hosting question `accept_opposite_sex` (unchanged).
- Document-upload size limits.
- Recap access beyond token expiry; PDF export of the recap.

## Amendment (2026-07-22, at merge)

Section 4 (« Read-only recap after submission ») was **dropped and never
shipped.** Between this spec being written and the branch being merged, the
application-recap-download feature landed on `main` and deliberately settled the
opposite way: `getApplicationDraft` returns a **marker only, never the PII**, for
any non-draft application, and the post-submit page renders an "already
submitted" notice plus an `ApplicationRecapButton` (PDF download) instead of the
answers inline.

Bjorn's decision at merge was to keep `main`'s behavior. Rendering the answers
inline would have made a minor's full submitted PII appear passively on page load
for anyone holding the resume token, rather than behind a deliberate download —
and the token's blast radius is already an open question (it never rotates on
submit and lives for up to 30 days). Everything else in this spec shipped:
gender/pronoun radio choices, the conditional specify field, browser-side photo
compression, and option-label rendering in the read view.

`actions/apply.ts` and `app/apply/resume/[token]/page.tsx` therefore carry
`main`'s versions verbatim. The no-PII guarantee is now pinned by the test
« returns a submitted marker with NO PII once the application is submitted ».
Note that `ApplicationReadView`'s label-rendering fix still shipped and still
matters — that component is used by the **organizer-facing**
`components/applications/ApplicationDetail.tsx`, independently of the resume page.
