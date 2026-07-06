# One email, one application — dedupe, mandatory fields, photo upload

**Date:** 2026-07-06
**Status:** Approved — ready for implementation plan
**Builds on:** `feature/application-resume-flow` (unmerged; this work stacks on it)

## Problem

1. **Duplicate applications (bug).** `startApplication` inserts a new `applications`
   row unconditionally. A student who reopens `/apply/[slug]` from another device,
   incognito, or after clearing storage and types the same email creates a second
   application. The resume branch only guards the same-device path (localStorage).
2. **Incomplete files.** Most application fields are optional, so organizers receive
   half-filled student files.
3. **Ugly photo upload.** The photo control is a bare `<input type="file">`.

## Decisions (locked)

- **One email = one application per exchange.** No sibling-sharing exception.
- **Rejection is final.** A rejected email cannot start a new application for the
  same exchange.
- **Photo is mandatory** to submit.
- No cropper / drag-and-drop for the photo — simple styled control only.
- Typing an email into the start form is **not** proof of owning it: an existing
  draft (or its resume token) is never exposed on-screen; the email inbox is the
  only recovery channel.

## Design

### 1. Duplicate prevention — `startApplication`

Before inserting, look up `applications` by `(exchange_id, email)` (email already
normalized via `normalizeEmail`). Three outcomes:

- **No existing row** → behave as today: insert draft, fire-and-forget resume
  email, return `{ token }`.
- **Existing `draft`** → no insert. Re-send the resume email to that address
  (reuses `sendApplicationResumeEmail` and the existing 3/hr-per-email rate
  limit), return `{ existing: 'draft' }`. Never return the token.
- **Any other status** (`submitted`, accepted, rejected, enrolled, …) → no insert,
  return `{ existing: 'submitted' }`. Rejected emails get the same response — the
  public screen never advertises a rejection.

Return values are **structured results, not thrown errors** (prod redacts Server
Action error messages; the client must be able to branch on the outcome).

**UI on `/apply/[slug]`** (both languages, FR shown):

- `existing: 'draft'` → « Une candidature est déjà en cours avec cette adresse —
  nous t'avons renvoyé le lien pour continuer par e-mail. »
- `existing: 'submitted'` → « Une candidature a déjà été envoyée avec cette
  adresse e-mail. »

**Database backstop:** new migration adding a **unique index on
`(exchange_id, email)`** on `applications` — unconditional (no status frees the
email). A `23505` unique-violation on insert (race between two tabs) maps to the
same `{ existing: ... }` response by re-reading the winning row's status.

**Pre-index cleanup in the same migration:** delete duplicate *draft* rows per
`(exchange_id, email)`, keeping the newest. If duplicate *submitted+* rows exist,
the migration must not silently delete them — review prod data manually before
pushing (known to contain at least one repro duplicate).

**Welcome-back interplay:** the resume branch's localStorage welcome-back screen
remains the instant same-device path. Its "Not you? Start a new application"
escape now behaves correctly when the same person re-enters their own email:
outcome = draft exists → link re-emailed, no duplicate row.

### 2. Mandatory fields

Policy, enforced in `lib/application-form.ts` (`missingRequiredApplication`) and
surfaced by the existing client-side highlight + submit gate:

- **All Student, Hosting-conditions, and Student-profile fields → required.**
  Free-text fields accept "none" / « aucun » where nothing applies.
- **Parents section → at-least-one-complete-parent rule.** All father fields, or
  all mother fields (or both). A partially filled parent group is invalid. Helper
  text: « Remplissez au moins un parent en entier. » / "Fill in at least one
  parent completely."
- **`family_status` → required.**
- **`separation_housing_address` → required only when `family_status` is
  `separated` or `step_family`**; hidden when `married` or unanswered.
- Autosave of partial drafts is untouched — mandatory means *can't submit*, not
  *can't save*. Server-side submit validation applies the same rules.

### 3. Photo upload

Replace the bare file input with an upload card at the top of the Student section:

- Rounded ~96px preview: uploaded photo once present; before that a neutral
  placeholder with a person-silhouette icon.
- Styled secondary button (matching existing shadcn form buttons): « Choisir une
  photo » → after upload « Remplacer la photo ». Triggers a hidden file input
  (`ALLOWED_UPLOAD_ACCEPT` unchanged).
- One-line hint with accepted formats/size; spinner state while uploading.
- Required marker (red asterisk) on the label; submit blocks via the standard
  missing-fields treatment when no photo is uploaded.

### 4. Branch & rollout

- Implement on `feature/application-resume-flow` (or a branch off it) — same
  files, one preview live-drive covering resume flow + dedupe + mandatory fields
  together, one merge to `main`.
- One new migration (unique index + draft-duplicate cleanup). Apply after the
  manual duplicate review of prod data.

## Testing

- **Unit — `startApplication`:** fresh email inserts + returns token; existing
  draft returns `{ existing: 'draft' }`, re-sends the resume email, inserts
  nothing; existing submitted/rejected returns `{ existing: 'submitted' }`,
  sends nothing; `23505` race maps to the correct `{ existing }` value; rate
  limits still enforced.
- **Unit — validation:** at-least-one-complete-parent (empty both → invalid,
  half-filled father → invalid, complete mother alone → valid); conditional
  `separation_housing_address`; photo required on submit; all previously
  optional fields now block submit when empty.
- **Component — start form:** renders the two "already exists" messages from the
  structured results.
- **Component — uploader:** placeholder → uploading → preview states; button
  label switches to "Replace"; required-field error shown when submitting
  without a photo.

## Out of scope

- Email verification / magic-link-first entry (rejected as too much friction).
- Organizer-side duplicate management UI.
- Photo cropping, drag-and-drop.
- All other feedback-list sub-projects (UI polish batch, collaborators, email
  cadence controls, 2FA, feedback widget) — separate specs.
