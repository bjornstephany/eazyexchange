# Fichiers tab — merge « Formulaires » and « Docs »

**Date:** 2026-07-18
**Status:** Approved by Bjorn (brainstorming session)

## Problem

The organizer rail has two separate tabs — « Formul. » (`/forms`, template kinds
`online` + `pdf`) and « Docs » (`/documents`, kind `doc`) — backed by two
near-identical views (`FormsView` / `DocsView`) over the same grid, cards, and
library drawer. The split costs a rail slot and forces organizers to remember
which of two places a template lives in, for no real benefit.

## Decision summary

- One merged rail tab labeled **« Fichiers »**, route stays **`/forms`**.
- Merged page shows **two sections**: « Formulaires » then « Documents
  demandés », one shared « + Ajouter » button.
- The add drawer shows a **sectioned standard library** (Formulaires /
  Documents subsections, one search box) plus **all three custom tiles**:
  Importer un PDF (→ formulaire), Créer en ligne, Demander un document.
  Behavior of each creation mode is unchanged.
- `/documents` and `/documents/[templateId]` become redirects; `DocsView` is
  deleted.

## 1. Navigation & routes

- `OrganizerShell` rail: replace the two items (`/forms` « Formul. »,
  `/documents` « Docs ») with one item — `href="/forms"`, label « Fichiers »,
  keeping one of the two existing icons. Active state:
  `pathname.startsWith('/forms') || pathname.startsWith('/documents')`
  (covers the redirect flash).
- `app/(organizer)/documents/page.tsx` → `redirect('/forms')`.
- `app/(organizer)/documents/[templateId]/page.tsx` →
  `redirect(`/forms/${templateId}`)`.
- `app/(organizer)/forms/[templateId]/page.tsx`: remove the
  `kind === 'doc' → /documents/…` redirect; the `TemplateEditor` page serves
  every kind with `backHref="/forms"`.
- `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx`: legacy redirect
  always targets `/forms/${formId}` (drop the kind branch).
- `actions/forms.ts`: every
  `revalidatePath(kind === 'doc' ? '/documents' : '/forms', 'layout')`
  collapses to `revalidatePath('/forms', 'layout')`.
- `app/robots.ts`: keep the `/documents` disallow entry (harmless) alongside
  `/forms`.

## 2. Merged page

- New `components/forms/FichiersView.tsx` replaces `FormsView` and `DocsView`
  (both deleted, with their tests merged — see §4).
- `app/(organizer)/forms/page.tsx` renders `FichiersView`.
- `getTemplatesPage(exchangeId)` (in `actions/forms.ts`) loses its
  `family` parameter and fetches all kinds (`online`, `pdf`, `doc`) in one
  query; it keeps returning `enrolledStudents` for `DocDrawer`.
- Layout: page title « Fichiers »; header row with one « + Ajouter » button
  (same styling as today). Below, two sections, each a mono-uppercase heading
  with count over the existing `TemplateGrid` / `TemplateCard`:
  1. « Formulaires (n) » — kinds `online` + `pdf`
  2. « Documents demandés (n) » — kind `doc`
  A section whose list is empty shows a one-line muted hint instead of a grid.
- Card click opens the detail drawer by kind: `FormDrawer` for
  `online`/`pdf`, `DocDrawer` (with `enrolledStudents`) for `doc`. Both
  drawers are unchanged.

## 3. Add drawer (LibraryDrawer)

- Drop the `family` prop; the drawer always serves both families.
- One search box. The standard library renders as two subsections —
  « Formulaires » (kinds `online`+`pdf`) then « Documents » (kind `doc`) —
  both filtered by the same query; a subsection with zero matching entries is
  hidden.
- `lib/forms/library.ts`: replace/extend `libraryEntries` with a pure grouped
  helper (e.g. `libraryEntriesGrouped(existingKeys, query)` returning
  `{ forms: LibraryEntry[]; docs: LibraryEntry[] }`), unit-tested.
- `existingKeys` is computed from **all** templates of the exchange, so
  already-added greying keeps working for both families.
- Custom area below the divider: all three tiles — Importer un PDF (mode
  `pdf`), Créer en ligne (mode `online`), Demander un document (mode `doc`).
  `CreateTemplateForm` and `createDraftTemplate` are unchanged: PDF upload
  still produces a formulaire; doc mode keeps audience/condition fields.
- Drawer header: a single « Ajouter » label (new key) instead of the per-family
  `addFormLabel` / `addDocLabel`.

## 4. Copy & tests

**i18n (all 5 locales — en/fr/es/it/de):**
- Nav label: fr « Fichiers », en "Files", es "Archivos", it "File",
  de "Dateien" (replaces `shell.nav.forms` + `shell.nav.documents` with one
  key).
- Page title « Fichiers », two section headings with counts, empty-section
  hints, drawer header, two library subsection headings.
- Obsolete keys (`documents.title`, `documents.requestedHeading`,
  `documents.addDocLabel`, `forms.addFormLabel`, old nav keys, …) are removed;
  keys still used by `DocDrawer`/`CreateTemplateForm`/`TemplateEditor` stay.

**Tests:**
- `FichiersView` tests (merging the old `FormsView`/`DocsView` suites): both
  sections render with the right templates, empty-section hint, correct
  drawer opens per kind, add button opens the library drawer.
- `LibraryDrawer` tests: sectioned list, search filters both subsections,
  subsection hides when empty, three custom tiles, greying via combined
  `existingKeys`.
- `library.ts` unit tests for the grouped helper.
- `OrganizerShell` / `RailPrefetch` tests: single « Fichiers » item, active on
  both path prefixes.
- Redirect coverage: `/documents` → `/forms`, `/documents/[id]` →
  `/forms/[id]`.

**Out of scope:** student portal (`/my-forms`), `TemplateEditor` internals,
standard-library content, any schema change (no migration → no RLS work).

## Verification

`pnpm lint`, `pnpm test`, `pnpm build` (via `npx tsc --noEmit` locally). No
`pnpm test:rls` needed (no migration/storage change).
