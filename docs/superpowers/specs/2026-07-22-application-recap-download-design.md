# Application recap download — design

**Date:** 2026-07-22
**Status:** approved, not built

## Problem

The application funnel ends on a single sentence. `components/ApplicationForm.tsx`
renders « Merci ! Ta candidature a été envoyée. » and nothing else; the student has
just typed several screens of personal information — name, parents, family
situation, health — and walks away with no copy of any of it. Reopening the
emailed resume link is no help: `app/apply/resume/[token]/page.tsx` deliberately
refuses to show a submitted application's data.

## Solution

Offer the applicant a PDF recap of their own answers at the end of the funnel,
downloadable from the confirmation screen and from the resume link afterwards.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Format | Server-generated PDF | Something a student or parent can keep or forward; matches the fillable-form PDFs already in the product. |
| Surfaces | Confirmation screen **and** the resume link's "already submitted" screen | Covers the student who closes the tab too fast, at almost no extra cost. |
| Content | Photo + every filled answer | The recap then looks like the real dossier. |
| Delivery | Server action returning base64 bytes | Reuses the token + rate-limit preamble in `actions/apply.ts`; no second anonymous entry point into the same data. |
| Expiry | Download stops when the resume token lapses | The expiry exists to stop an old emailed link leaking a minor's dossier; no carve-out. |

Rejected: emailing the PDF (mails a minor's full dossier unprompted, and puts
attachment size in the deliverability path); a `GET /recap.pdf` route handler
(re-implements token/expiry/rate-limit checks that `apply.ts` already owns, and
CLAUDE.md keeps application code split by trust model); client-side generation
(the resume screen holds no form state, and embedding the photo would mean
handing the browser a signed URL — two code paths for one feature).

## Architecture

### 1. `lib/pdf/application-recap.tsx` (new)

```ts
renderApplicationRecapPdf(input: {
  exchangeName: string
  applicantName: string
  submittedAt: string | null
  data: Record<string, string>
  photoBytes: Uint8Array | null
  language: 'en' | 'fr'
}): Promise<Buffer>
```

Server-side only. Reuses `lib/pdf/fonts.ts` and the same `Font.register` +
hyphenation-callback setup as `lib/pdf/fillable-pdf.tsx`, but is a separate
module: the fillable renderer walks a `FillableDefinition` block tree, which has
nothing in common with a flat answers map.

Layout is driven by iterating `APPLICATION_SECTIONS` from
`lib/application-form.ts` — never a hand-written field list. A question added to
the funnel later appears in the recap automatically, with no second place to
update.

- Header: exchange name, applicant name, submission date.
- Photo, when `photoBytes` is present.
- Per section: the section title, then each field as `label[language]` + answer.
- `yesno` and `radio` answers resolve through their option labels, not raw values.
- Empty answers are skipped.

### 2. `downloadApplicationRecap(token)` in `actions/apply.ts`

Lives in `actions/apply.ts` because it is anonymous resume-token trust, the same
model as every other action in that file.

```ts
type RecapResult =
  | { ok: true; filename: string; pdf: string /* base64 */ }
  | { ok: false; reason: 'not_found' | 'expired' | 'not_submitted' }
```

Structured returns, not throws — production redacts thrown Server Action
messages (CLAUDE.md).

Sequence:

1. `enforceRateLimit` with `clientIp()`, as the file's other token actions do.
2. Admin-client lookup by `resume_token`, selecting
   `status, data, language, photo_path, submitted_at, resume_token_expires_at,
   exchanges(name)`. → `not_found` when absent.
3. `tokenExpired(resume_token_expires_at)` → `expired`.
4. `status` still `'draft'` or `'invited'` → `not_submitted`. Only a submitted
   (or further-along) application has a recap.
5. When `photo_path` is set, `admin.storage.download(APPLICATION_PHOTO_BUCKET,
   photo_path)` → bytes. A missing or unreadable file drops the photo and the
   rest of the PDF still renders; a broken upload must not cost the student
   their recap.
6. `renderApplicationRecapPdf(...)` → base64.
7. `filename` is built server-side from the applicant name and exchange, slugified
   and ASCII-folded: `candidature-<prenom>-<nom>.pdf`.

**Deliberate PII relaxation.** `getApplicationDraft` returns *no* PII once
`status !== 'draft'` — that is why the resume page can only say "already
submitted". This action does the opposite on purpose: it returns the applicant's
own answers *because* they are submitted. The token holder is the applicant, so
the trust model is unchanged, but it is a new PII egress path and gets a comment
next to the existing "never the PII" one so a future reader does not read it as
a mistake.

### 3. `components/ApplicationRecapButton.tsx` (new)

`'use client'`, props `{ token: string; language: 'en' | 'fr' }`. Secondary
button: « Télécharger mes réponses (PDF) » / "Download my answers (PDF)".

On click: call the action, decode base64 into a `Blob`, trigger an `<a download>`
with the returned filename, revoke the object URL. While in flight the button is
disabled with a « Préparation… » / "Preparing…" label. Any `ok: false` renders an
inline retry line — never a raw error.

Copy lives in the component's own inline `T` map, matching the funnel's existing
bilingual convention (`ApplicationForm`'s `T`), not next-intl.

### 4. Call sites

- `components/ApplicationForm.tsx:99` — the `done` branch grows from a bare
  sentence into a small block: the thank-you line plus the button. Token and
  language are already in scope.
- `app/apply/resume/[token]/page.tsx` — the `draft.submitted` branch gets the
  button under the existing green line.

### 5. Ripple: `getApplicationDraft`

Its `submitted` branch returns only `{ expired, submitted, exchangeName }`. Add
`language` so the resume page renders the button in the language the student
applied in. No other field is added — the branch must keep leaking nothing else.

## Data flow

```
[confirmation screen] ─┐
                       ├─ ApplicationRecapButton(token, language)
[resume page, submitted]┘        │
                                 ▼
                downloadApplicationRecap(token)   (actions/apply.ts)
                  rate limit → row by token → expiry → submitted?
                  → storage.download(photo) → renderApplicationRecapPdf
                                 │
                                 ▼
                  { ok: true, filename, pdf: base64 }
                                 │
                                 ▼
                        Blob → <a download>
```

## Error handling

| Case | Behaviour |
| --- | --- |
| Unknown token | `not_found` → inline "ce lien n'est plus valide" line. |
| Expired token | `expired` → inline line pointing at the organizer. |
| Still a draft | `not_submitted` → inline line; button should not be reachable in this state anyway. |
| Photo missing / storage error | Logged without PII, PDF renders without the photo. |
| Renderer throws | Propagates as an unexpected error → `instrumentation.ts` records it; button shows a generic retry line. |
| Rate limit exceeded | Handled by `enforceRateLimit` exactly as the file's other actions. |

## Testing

- `lib/pdf/__tests__/application-recap.test.ts` — renders a non-empty `%PDF`
  buffer; field labels and answers present; `yesno`/`radio` render option labels;
  empty answers omitted; `photoBytes: null` renders fine.
- `actions/__tests__/apply-recap.test.ts` — the four returns (`not_found`,
  `expired`, `not_submitted`, happy path), plus: photo download attempted when
  `photo_path` is set, and a storage failure still yields `ok: true`.
- `components/__tests__/ApplicationRecapButton.test.tsx` — success triggers a
  download; `ok: false` renders the inline error.

## Out of scope

- No schema change, no migration, no RLS work — `pnpm test:rls` is not triggered.
- Organizer-side download (they already have `PrintButton` on the detail page).
- Emailing the recap.
- Any change to what a *draft* application exposes.
