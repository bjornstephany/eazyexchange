# Make forms & document upload usable — design

**Date:** 2026-07-15
**Branch:** `feature/forms-upload-usable` (worktree off `main`, independent of the in-flight i18n work)
**Status:** approved by Bjorn (section-by-section) 2026-07-15

## Problem

The forms/documents collection feature — the core of the product — is unusable in production today:

1. **Clicking « Activer » on a template crashes with an opaque error.** `activateTemplate` (and sibling actions in `actions/forms.ts`) `throw` for *expected* validation outcomes ("Ajoutez une échéance avant d'activer.", "Téléversez le PDF avant d'activer."). Production redacts thrown Server Action error messages into a digest string (see CLAUDE.md), so the organizer sees only "An error occurred in the Server Components render…" with no clue what to fix. Standard templates seed with no deadline and no PDF, so **every** standard template hits this wall.
2. **The built-in standard library doesn't match the real program.** It's a generic 10-item France-exchange set (consentement photo, conditions d'accueil, livret de famille…). The real program (files in `docs/exampleSchoolFiles/`) needs: Medical Authorisation, Décharge/Code de conduite, Demande d'absence, Engagement de famille, AST — plus student passport, parent passport (same parent that signed the AST), and ESTA (apply at esta.cbp.dhs.gov, upload the authorization proof).
3. **The real form files are .docx**, but the whole `pdf`-template pipeline (organizer input, `form-templates` bucket MIME allowlist, student download-print-sign flow) is PDF-only.
4. **Standard templates can't be deleted** (`deleteTemplate` refuses `standard_key IS NOT NULL`), so irrelevant defaults clutter every exchange forever.
5. **No "instructions + external link" pattern** exists for items like ESTA.

## Decisions made during brainstorm

- Convert the 4 .docx forms to PDF **once**; the pipeline stays PDF-only (files print reliably, families can't accidentally edit).
- Rework the standard library to the real 8-item program (below). Templates seed **without** files — the PDFs are school-specific, so each school's organizer attaches their own per exchange. No bundled/auto-attached files.
- ESTA is **one** checklist item: prominent external-link button + proof upload slot.
- AST: the official CERFA 15646 PDF gets attached to the template like any other form (Bjorn attaches it via the UI).
- Bjorn loads the 5 real PDFs through the normal organizer UI — this doubles as the end-to-end verification.
- Rejected alternatives: minimal bugfix only (library stays misleading); school-level reusable file library (YAGNI — MVP is one exchange per school pair).

## Design

### 1. Structured validation results + activation readiness hints

- `activateTemplate`, `createTemplate`, `updateTemplateMeta`, `replaceTemplateFile` in `actions/forms.ts` return structured results for expected failures — `{ ok: true, … } | { ok: false, message: string }` (pattern: `lib/billing/exchange-limit.ts`). Genuinely unexpected failures (DB errors, auth) still throw. `createTemplate` keeps returning the new template id on success (`{ ok: true, id }`).
- Callers (`FormDrawer`, `DocDrawer`, `AddFormPanel`, `AddDocPanel`, `TemplateEditor`) read the returned message and render it inline instead of relying on `err.message` (which prod redacts).
- **Readiness hints:** the drawer footer area lists what still blocks activation *before* the click, computed from the view-model it already has: missing deadline; missing PDF (`pdf` kind); no questions (`online` kind); (conditional docs already have the student picker). Each hint links to « Modifier le modèle ». The Activer button stays enabled — clicking surfaces the same structured message, so there is feedback either way. `TemplateVM` (`lib/forms/rollup.ts`) already carries `deadline`/`template_file_path`/field info or gets extended minimally.

### 2. Standard library rework (`lib/forms/standard-library.ts`)

New seed set (all drafts, no deadlines, no files):

| # | key | Nom | kind | notes |
|---|-----|-----|------|-------|
| 1 | `medical` | Autorisation médicale | pdf | download → sign → upload |
| 2 | `decharge` | Décharge de responsabilité / code de conduite | pdf | |
| 3 | `absence` | Demande d'absence | pdf | |
| 4 | `famille` | Engagement de famille | pdf | |
| 5 | `ast` | AST — autorisation de sortie du territoire (CERFA 15646) | pdf | was `doc`; now the CERFA PDF is attached and re-uploaded signed |
| 6 | `passeport` | Passeport de l'élève | doc | |
| 7 | `passeport-parent` | Passeport du parent signataire de l'AST | doc | description stresses SAME parent as AST signatory |
| 8 | `esta` | ESTA — autorisation de voyage États-Unis | doc | `external_url = 'https://esta.cbp.dhs.gov'`; description explains apply-then-upload-proof |

Dropped: consentement photo, conditions d'accueil, pièce d'identité parent 1/2, livret de famille, formulaire médical complémentaire. Schools needing them add custom templates (existing flow). Each `pdf`/`doc` template still gets its single required document slot at seed time. Checklist fields (« champs à renseigner ») on the `pdf` templates: `medical` keeps the current santé field list; `decharge` keeps the current décharge field list; `absence`, `famille`, and `ast` seed with **no** fields (signature-only) — valid because only `online` kind requires fields to activate.

- **Standard templates become deletable:** remove the `standard_key` guard in `deleteTemplate`. The existing confirm dialog already warns about submissions. `FormDrawer`/`DocDrawer` show the delete button for standard templates too.

### 3. Schema migration + reseed

One migration (staging first, then prod via MCP `apply_migration`, per CLAUDE.md):

1. `alter table form_templates add column external_url text null;` — readable wherever templates already are; no policy changes.
2. Reseed existing exchanges: delete standard-key templates still in `status = 'draft'` (drafts have no assignments/submissions by construction — the gated triggers skip drafts), then insert the new 8-item set for every existing exchange (SQL snapshot of the new library, same approach as `20260703000001`), **skipping any item whose `standard_key` already exists on that exchange** (an active old-library template with a colliding key must not produce a duplicate). Active standard templates are left untouched.

Post-apply: regenerate `types/supabase.ts` via MCP, `npx tsc --noEmit`, ledger/filename drift check, `pnpm test:rls` (no new tables/buckets — matrix should pass unchanged, but must run).

### 4. External link (ESTA pattern, generic)

- **Student assignment page** (`app/(student)/my-forms/[assignmentId]/page.tsx`): when `template.external_url` is set, render a prominent button above the upload form — e.g. « Faire la demande ESTA ↗ » (link opens in new tab, `rel="noopener noreferrer"`). Label comes from the template name; URL is shown alongside so families can verify it.
- **Template editor** (`TemplateEditor`): optional « Lien externe » field, validated server-side in `updateTemplateMeta` (`https://` URLs only, length-capped). Any template — standard or custom — may carry a link.
- **Drawers**: show the link when present.

### 5. Files

- Convert the 4 .docx in `docs/exampleSchoolFiles/` to PDF (LibreOffice headless) alongside the originals; fetch the official CERFA 15646 PDF there too. Reference files only — the app never reads them; Bjorn attaches them via the UI.

## Error handling

- Expected outcomes (validation) → structured returns rendered inline (works in prod).
- Unexpected failures → still thrown; drawers keep a generic « Une erreur est survenue. » fallback.
- Storage upload failures in `replaceTemplateFile`/`createTemplate` surface as structured messages (size/MIME rejections from the bucket are expected outcomes).

## Testing

- Update existing unit tests that assert on thrown strings from the four converted actions; add cases for the structured shapes.
- Seed-library test updated to the 8-item set (keys, kinds, slots, `external_url` on `esta`).
- Component tests: drawer readiness hints; delete button visible on standard templates; student page renders the external-link button; editor link field round-trip.
- `pnpm lint && pnpm test && pnpm build` + `pnpm test:rls` (migration touched).

## Definition of done

1. Full gate green on the branch.
2. Migration live on staging + prod, types regenerated, ledger drift-free.
3. Bjorn, via the normal UI on the real exchange: attaches the 5 PDFs, sets deadlines, activates all 8 items — no opaque errors, hints guide the gaps.
4. A test student sees the checklist, downloads a form PDF, uploads it back, submits; ESTA shows the link button and accepts the proof upload.

## Out of scope

- School-level reusable file library (attach once per school).
- i18n of the new copy (hardcoded French like surrounding components; the i18n phase 2/3 sweep picks it up later).
- Confirm-only checklist item type (ESTA is a single link+upload item).
