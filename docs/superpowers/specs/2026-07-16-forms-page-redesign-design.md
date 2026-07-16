# Forms & Documents Page Redesign — Design

**Date:** 2026-07-16
**Status:** Approved by Bjorn (brainstorming session, visual companion mockups in `.superpowers/brainstorm/15268-1784233102/`)

## Goal

Replace the slab-list layout of the organizer `/forms` and `/documents` pages with a
grid of portrait "A4 paper" cards that visually preview each document, and move the
standard-template library out of auto-seeding into a searchable drawer the organizer
adds from.

## Scope decisions (locked during brainstorming)

1. **UI redesign only.** PDF → fillable-form conversion is explicitly out of scope;
   uploaded PDFs keep today's download → sign → re-upload behavior. The card layout
   leaves room for a « convertir » action in a future project.
2. **Library replaces seeding.** New exchanges start with an empty grid; the 10
   standard templates live in a searchable library and become exchange templates
   only when the organizer adds them.
3. **Both pages.** `/forms` (kinds `online` + `pdf`) and `/documents` (kind `doc`)
   share the same new component system.
4. **Cleanup migration.** Already-seeded pristine drafts on existing exchanges are
   deleted so old exchanges get the same clean experience.
5. **Card style: portrait A4 preview cards** (approved mockup option C, v2) — the
   preview zone shows the document itself.
6. **Library placement: right-side drawer** (approved mockup option A), opened by a
   single « + Ajouter » button.
7. **Thumbnails are client-rendered** with `pdfjs-dist` (approach 1) — no schema
   change, no server rasterization.

## Removed from the current page

- Subtitle: « Les documents et formulaires que les familles complètent… »
- The `StatsCard` block (Formulaire actif / Élèves concernés / Demandés en /
  Réponses reçues) and the `PageBanner` ✉ auto-send notice.
- `StatsCard` and `PageBanner` components are deleted if no other consumer remains.
- `AddFormPanel` / `AddDocPanel` are absorbed into the new library drawer and deleted.

## Page structure

Both pages render, top to bottom:

1. **Header** — page title only.
2. **Toolbar row** — left: existing count label (« VOS FORMULAIRES (N) » /
   documents equivalent); right: primary button **« + Ajouter »** opening the
   library drawer.
3. **`TemplateGrid`** — responsive: 4 columns wide desktop / 3 laptop / 2 tablet /
   1 at 375px.
4. Existing detail drawers (`FormDrawer` / `DocDrawer`) unchanged; the card click
   opens them.

## Components

### `TemplateCard`

Portrait card, A4-proportioned preview zone on top, then name, type pill, response
count. Status chip (Actif / Brouillon) overlays the preview top-right. The card has
no buttons; clicking anywhere opens the existing detail drawer where Aperçu /
Modifier / Supprimer / Télécharger already live.

Preview zone modes:

| Template state | Preview |
|---|---|
| `pdf` kind with `template_file_path` | Real page 1 of the PDF (client-rendered thumbnail) |
| `pdf` kind, draft without file | Dashed placeholder « PDF à joindre » |
| `online` kind | "Paper" mini-page rendering the template's real field labels (pure CSS/JSX from `fields` already returned by `getTemplatesPage`) |
| `doc` kind | Illustrative placeholder (students upload these; there is no organizer document to preview) |

Response count: `x / y reçues` for active templates (from existing assignee
rollups), `—` for drafts.

### `LibraryDrawer`

Right drawer, same 460px pattern as `FormDrawer`. Contents:

- Search field (client-side filter on name + description).
- Standard-library entries filtered to the page's family (forms → `online` + `pdf`;
  documents → `doc`). Each has an « Ajouter » button; entries whose `standard_key`
  already exists on the exchange are greyed with « déjà ajouté ✓ ».
- Divider, then two custom tiles: « Téléverser un PDF » and « Créer un formulaire en
  ligne » (documents page: « Demander un document »). Clicking one flips the drawer
  to the short create form (name, échéance optionnelle, PDF file when relevant) —
  same fields and `createDraftTemplate` action as today's add panels.
- Adding/creating closes the drawer and opens the new template's detail drawer
  (same continuation as today's `onCreated`).

### `TemplateThumbnail` (client)

- `IntersectionObserver` defers work until the card nears the viewport.
- Then: `getTemplateFileUrl(templateId)` (existing signed-URL action) → dynamic
  `import('pdfjs-dist')` → render page 1 to canvas at ~2× card width → swap in the
  image.
- **Cache:** PNG data-URL in `localStorage` keyed by `template_file_path` (file
  replacement changes the path, so invalidation is automatic), plus an in-memory
  session layer. Cap ~20 entries, evict oldest.
- **Fallbacks:** shimmer placeholder while rendering; on any failure (signed URL,
  corrupt PDF, pdf.js error) fall back silently to the stylized generic page. A
  broken thumbnail must never break the card or raise a toast.
- `pdfjs-dist` is a new dependency, loaded only on demand (dynamic import), never in
  the main bundle.

## Data & server actions

- **Library source of truth** stays `STANDARD_TEMPLATES` in
  `lib/forms/standard-library.ts`. The drawer receives it (filtered by family) plus
  the exchange's existing `standard_key`s.
- **New action `addStandardTemplate(exchangeId, standardKey)`** in
  `actions/forms.ts`: `requireOrganizer()`, validate the key against
  `STANDARD_TEMPLATES`, insert draft template + fields/slots. Refactor
  `seedStandardTemplates`'s per-template insert into a shared
  `insertStandardTemplate` helper. Returns structured `{ ok, message }` (never
  throws for expected outcomes, per the error-redaction convention); duplicate adds
  (unique index on `(exchange_id, standard_key)`) return a friendly « déjà ajouté ».
- **Stop auto-seeding:** remove the `seedStandardTemplates` call from
  `createExchange` (`actions/exchanges.ts`); delete the function once unused.
- **No new tables or columns.** `getTemplatesPage` already returns everything the
  cards need.

## Migration (data-only)

Delete pristine seeded drafts:

```sql
delete from form_templates
where standard_key is not null
  and status = 'draft'
  and template_file_path is null
  and not exists (select 1 from assignments a where a.template_id = form_templates.id);
```

`form_fields`, `document_slots`, `assignments` cascade on delete. Applied staging
first, then prod via MCP `apply_migration`, per the DB workflow. No RLS/policy
changes expected, but `pnpm test:rls` runs as part of the gate since
`supabase/migrations/` is touched.

## i18n

All new copy (drawer labels, search placeholder, « déjà ajouté », preview
placeholders, count labels) goes through next-intl in all 5 languages
(en/fr/es/it/de). Keys removed with the deleted components are pruned from all 5
files; the existing message-parity test keeps this honest.

## Testing

- Card display logic: preview-mode selection per kind/status/file, response-count
  label.
- `LibraryDrawer` logic: family filter, search filter, already-added greying.
- `addStandardTemplate`: auth, invalid key, duplicate, happy path (mocked supabase,
  same style as existing action tests).
- Update `FormsView`/`DocsView` tests for the new structure; delete tests belonging
  to removed components (`StatsCard`, `PageBanner`, `AddFormPanel`, `AddDocPanel`).
- Thumbnail component: fallback behavior on failure (mock pdf.js), cache key usage.

## Verification & rollout

`pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:rls`. Feature branch + PR (this
is multi-step work); the migration goes to staging before prod. No edge-function,
billing, or email surface is touched.

## Out of scope (explicit)

- PDF → fillable-form conversion (future project; card layout reserves room).
- Server-generated thumbnails (upgrade path if client rendering ever feels slow:
  render at upload, store PNG next to the PDF, add `thumbnail_path` — invisible to
  users).
- Student-side pages, reminder pacing, and the exchange detail page.
