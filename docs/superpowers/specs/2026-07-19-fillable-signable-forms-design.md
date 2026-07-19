# Fillable, signable standard forms — design

**Date:** 2026-07-19
**Status:** approved (brainstorm with Bjorn, 2026-07-19)

## Problem

Four standard forms (source PDFs in `docs/exampleSchoolFiles/`) are today handled as
`kind: 'pdf'` templates: the organizer attaches a static PDF, families download,
print, sign by hand, scan, and re-upload. The four forms:

1. **Décharge de responsabilité** (+ code de conduite de l'élève)
2. **Demande d'absence du lycée**
3. **Engagement de famille**
4. **Medical authorisation / Autorisation médicale** (bilingual EN/FR)

They are prewritten French legal text with blanks and hand signatures. The program
specifics (chaperones, destination, dates, school names, proviseur, association)
are baked into the text, so every school must re-author the documents.

## Goal

Ship these four forms as product-maintained **fillable, e-signable** templates:

- Families fill and sign fully online — no printer.
- The key program details are variables an organizer edits once per exchange.
- On submit the app generates a completed, signed PDF the organizer can download
  for the lycée / authorities.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Signature model | Fully online e-sign: typed full name + « Lu et approuvé » checkbox, server-side timestamp; app generates the completed PDF. No paper path. |
| Multiple signatories (père, mère, élève) | All sign in one session on the family's device — one signature block per signatory; second parent optional where the original allows. No per-signer email links. |
| Where variables live | One shared « Détails du programme » per exchange (Settings → Programme). Edit once, all forms update. No per-template overrides. |
| Body text | Fixed, ships with the product. Organizers edit variables only. Wording changes are product updates. |
| Architecture | Code-defined document definitions rendering both the web form and the PDF (approach A). Rejected: DB-driven rich templates (YAGNI, text in every school's DB); stamping answers onto the original PDFs (mid-sentence variables need text reflow — overlay can't). |

## Architecture

A new template kind **`fillable`** joins `online` / `pdf` / `doc`
(`TemplateKind` in `types/db.ts`). Fillable template rows store
`type: 'data_entry'` (they collect structured data, not uploads) but have
neither `form_fields` rows nor `document_slots`: the document structure lives
in code.

```
lib/forms/fillable/
  types.ts        — block/run/definition types
  decharge.ts     — Décharge de responsabilité + code de conduite
  absence.ts      — Demande d'absence du lycée
  engagement.ts   — Engagement de famille
  medical.ts      — Medical authorisation (bilingual)
  index.ts        — registry keyed by standard_key
  render.ts       — pure substitution/validation helpers (unit-tested)
```

The standard library entries (`lib/forms/standard-library.ts`) for keys
`medical`, `decharge`, `absence`, `famille` switch `kind: 'pdf'` →
`kind: 'fillable'`. New adds from the library drawer create fillable templates
(no file, no document slot, no form_fields). **Templates already created by a
school as `pdf` keep working untouched** — no data migration of existing rows.

### Definition format

A definition is an ordered list of blocks:

- `heading` — section titles (« DECHARGE DE RESPONSABILITE »).
- `paragraph` — ordered inline runs: fixed text | `variable` (program detail /
  exchange name) | `blank` (family input, possibly mid-sentence, with a stable
  `key`, a label, and a `prefill` hint — e.g. student name from the account).
- `field` — standalone labelled input below a paragraph: text, textarea,
  radio (« demi-pensionnaire / externe / interne »), phone.
- `signature` — one block per signatory: stable `key`, role label
  (« Représentant légal 1 », « Élève »…), `required: boolean`,
  `prefill: 'student_name' | null`.
- `divider` — the ✂ separation rules of the originals.

Each definition declares `variables: ProgramVariable[]` — the program-details
fields it consumes (used by the activation gate).

### Content fidelity rules

- Text transcribed faithfully from the source PDFs, French accents intact.
- Paper-only instructions are neutralized (« la ramener au bureau 307 » →
  « de compléter l'autorisation ci-dessous »).
- The medical form stays bilingual EN/FR like the original (it is read by US
  host families). The `0 11 33` phone prefix stays as fixed text before the
  phone blanks.
- Signature policy per form:
  - **Décharge:** représentant légal 1 (required) + représentant légal 2
    (optional) + élève (required, for the code de conduite section), plus the
    « à ___ le ___ » place blank (date is the server timestamp).
  - **Engagement:** père + mère blocks, each individually optional but **at
    least one parent required** (single-parent families), + élève (required).
  - **Absence:** one parent/responsable légal (required).
  - **Medical:** father + mother blocks, each individually optional, at least
    one required.
- No association logo in v1 (the AGESSIA banner on the engagement form is
  dropped; plain heading instead).

## Data model (one migration)

### New table `exchange_program_details` (1:1 with exchanges)

| Column | Type | Example |
|---|---|---|
| `exchange_id` | uuid PK, FK → exchanges ON DELETE CASCADE | |
| `destination` | text | « Minnesota, USA » |
| `travel_start` | date | 2025-10-17 |
| `travel_end` | date | 2025-11-02 |
| `chaperones` | text[] | {« Polly STEPHANY », « Susan ALABASTER-DARY », « Chantal KERLOCH »} |
| `association_name` | text | « AGESSIA » |
| `sending_school_name` | text | « Lycée Georges Duby » |
| `receiving_school_name` | text | « Edina High School » |
| `proviseur_name` | text | « Mme Sharon MIRON HUGHES » |
| `absence_dates` | text[] | {« le jeudi 19 octobre 2025 », « le vendredi 20 octobre 2025 »} |
| `sending_city` | text | « Luynes » |
| `updated_at` | timestamptz | |

All content columns nullable — the row can be created incrementally; the
activation gate (below) enforces completeness per form. The exchange **name**
is NOT duplicated here; it comes from `exchanges.name`.

RLS (matrix cases in the same PR, `pnpm test:rls`):

- Organizers of the owning school: SELECT / INSERT / UPDATE.
- Enrolled students of the exchange: SELECT (they render the form text).
- Partner-school isolation: organizers/students of another school (including
  the partner-boundary third school per the T5 convention) see nothing.

### `submissions` — two nullable columns

- `fillable_data jsonb` — `{ answers: { [key]: string }, signatures: [{ key,
  role_label, full_name, signed_at }] }`. Keys are the stable definition keys.
- `generated_pdf_path text` — storage path of the signed PDF in the existing
  submissions bucket.

`field_answers` / `document_uploads` are not used by fillable submissions.
`types/db.ts` narrows `fillable_data` to a typed shape (Override pattern).

## Flows

### Organizer

1. Settings → Programme gains a « Détails du programme » card: all fields
   above, chaperones and absence dates as add/remove lists, save via a server
   action (`requireOrganizer()`, upsert). Prefill hints from existing data
   where sensible (school names from the schools records) at first save.
2. Library drawer add → draft fillable template (existing duplicate guard via
   `standard_key` unique index applies unchanged).
3. **Activation gate:** `activateTemplate` adds a branch for
   `kind: 'fillable'` — every variable the definition declares must be
   non-empty in `exchange_program_details`; otherwise a structured error
   listing the missing field labels and pointing to Réglages → Programme.
   (Existing checks for pdf/online kinds unchanged.)
4. Editing program details later re-renders everywhere automatically —
   values substitute at render time. Only the generated PDF of an already
   **submitted** form freezes its values.

### Student / parent

1. `/my-forms/[assignmentId]` gains a fillable renderer: document-style page,
   real text with variables substituted, blanks as inline inputs, fields
   below their paragraphs, then one signature card per signatory (full name
   input — student's prefilled where declared —, required « Lu et approuvé »
   checkbox, legal mention that submitting constitutes an electronic
   signature). Optional signatories can be left empty entirely, but a
   partially filled optional block (name without checkbox or vice versa) is a
   validation error.
2. Draft save as today (`status: 'draft'`, `fillable_data` written without
   `signed_at` timestamps; checkbox state not persisted in drafts).
3. **Submit** (server action under `requireStudent()`): validate all required
   blanks/fields/signatures → stamp `signed_at` server-side (now, UTC) →
   render PDF → upload to submissions bucket → write `fillable_data` +
   `generated_pdf_path` + `status: 'submitted'`. PDF render failure returns a
   structured error and leaves the submission in `draft` — the write happens
   only after a successful upload.

### Review

The organizer review page renders the completed document read-only (same
substitution code) + « Télécharger le PDF signé » via a short-lived signed
URL (same pattern as document uploads). Approve / reject / rejection email /
reminders / dashboard rollups: unchanged — fillable assignments count like
any other.

## PDF generation

- **`@react-pdf/renderer`**, server-side, inside the submit server action
  (Node runtime; text reflow around substituted values; embedded TTF with
  full French diacritics — bundle a font file, no runtime fetch).
- Layout: clean regeneration of the document (headings, paragraphs, answers
  inline, underlined blanks), not a pixel copy of the originals.
- Signatures render as: « Signé électroniquement par {full_name} le
  {date} à {heure} — "Lu et approuvé" » (Europe/Paris display).
- The PDF embeds the exchange name + `association_name` in a footer with the
  submission id for traceability.

## Error handling

House pattern throughout: expected outcomes are structured returns
(missing program details on activation, validation failures, PDF failure at
submit); only genuinely unexpected crashes throw and land in
`error_reports`. No student PII in logs — including PDF failure reports
(report the assignment id, never names/answers).

## Testing

- `render.ts` pure helpers: substitution (variables + prefills), missing-
  variable detection per definition, signature/blank completeness validation
  — vitest unit tests.
- Each of the 4 definitions: snapshot-style test that every `blank`/
  `signature` key is unique and every declared variable is actually used.
- PDF: smoke test — render one filled décharge to a Buffer, assert non-empty
  and `%PDF` magic bytes.
- Server actions: existing patterns (auth preamble errors, structured
  returns) extended to the new actions.
- RLS: matrix cases for `exchange_program_details` (organizer own/other
  school, student enrolled/not, partner boundary).
- Gates: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`.

## Migration & rollout

1. One migration: `exchange_program_details` + two `submissions` columns +
   RLS policies. Staging first (`supabase db push --db-url "$STAGING_DB_URL"`),
   then prod via MCP `apply_migration`; regenerate `types/supabase.ts`.
2. Library kind flip ships in the same PR (code only).
3. No backfill: existing pdf-kind templates keep working; organizers who want
   the new experience add the fillable version from the library (the
   `standard_key` unique index means they must delete the old one first —
   acceptable, and the drawer's duplicate message already explains itself).

## Out of scope (v1)

- Per-signer email links / external e-signature providers.
- Organizer-editable body text or custom fillable templates.
- Association logos on the PDF.
- Translating the fixed French legal text (student portal i18n is a separate
  deferred phase).
- Bulk PDF download of all signed forms.
