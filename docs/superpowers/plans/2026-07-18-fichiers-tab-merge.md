# Fichiers Tab Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the organizer rail's « Formul. » (`/forms`) and « Docs » (`/documents`) tabs into one « Fichiers » tab at `/forms`, with a two-section page and a single sectioned add drawer.

**Architecture:** A new `FichiersView` client component replaces `FormsView` + `DocsView` over the existing `TemplateGrid`/`TemplateCard`/`FormDrawer`/`DocDrawer` building blocks. `LibraryDrawer` loses its `family` prop and renders the standard library as two subsections via a new pure helper `libraryEntriesGrouped`. All `/documents` routes become redirects; `getTemplatesPage` fetches all template kinds in one query. No schema change, no RLS work.

**Tech Stack:** Next.js 14 App Router (server components + server actions), next-intl (5 locales, fr = reference), Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-18-fichiers-tab-merge-design.md`

## Global Constraints

- Route stays **`/forms`**; `/documents` and `/documents/[templateId]` become redirects (`/forms`, `/forms/${templateId}`).
- **All 5 locales** (en/fr/es/it/de) get every new key; `messages/__tests__/parity.test.ts` enforces parity against fr. Nav label values, verbatim from spec: fr « Fichiers », en "Files", es "Archivos", it "File", de "Dateien".
- **Unchanged, do not touch:** `DocDrawer.tsx` (its `/documents/${vm.id}` links are served by the redirect), `CreateTemplateForm` (inside LibraryDrawer.tsx), `TemplateEditor`, `TemplateGrid`, `TemplateCard`, the student portal (`/my-forms`), `lib/forms/standard-library.ts`, and `app/robots.ts` (the `/documents` disallow entry stays — harmless).
- Package manager is **pnpm**. Verification gate: `pnpm lint`, `pnpm test`, `npx tsc --noEmit` (local build fails on placeholder env — tsc is the build check). No `pnpm test:rls` (no migration).
- Work on branch `feature/fichiers-tab-merge` (multi-step feature → never on `main`). Execute in a git worktree (superpowers:using-git-worktrees) — this also keeps `pnpm test` from sweeping other sessions' worktree tests.
- Commit after each task once its tests pass.

## File Map

| File | Action |
|---|---|
| `lib/forms/library.ts` | Add `libraryEntriesGrouped`; later delete `libraryEntries` + `LibraryFamily` |
| `lib/forms/__tests__/library.test.ts` | Add grouped tests; delete old `libraryEntries` tests |
| `messages/{en,fr,es,it,de}.json` | Add `organizer.files.*`, `organizer.shell.nav.files`, 3 `organizer.library.*` keys; later remove obsolete keys |
| `components/forms/LibraryDrawer.tsx` | Drop `family`, sectioned list, 3 tiles, new header |
| `components/forms/__tests__/LibraryDrawer.test.tsx` | Rewrite for merged drawer |
| `components/forms/FichiersView.tsx` | **Create** (merged page view) |
| `components/forms/__tests__/FichiersView.test.tsx` | **Create** (merged FormsView+DocsView suites) |
| `components/forms/FormsView.tsx` + test | **Delete** (Task 4) |
| `components/documents/DocsView.tsx` + `components/documents/__tests__/` | **Delete** (Task 4) |
| `actions/forms.ts` | `getTemplatesPage` loses `family`; 5 conditional `revalidatePath` collapse to `/forms` |
| `actions/__tests__/add-standard-template.test.ts` | `/documents` expectation → `/forms` |
| `app/(organizer)/forms/page.tsx` | Render `FichiersView` |
| `app/(organizer)/documents/page.tsx` | → `redirect('/forms')` |
| `app/(organizer)/documents/loading.tsx` | **Delete** |
| `app/(organizer)/documents/[templateId]/page.tsx` | → `redirect(\`/forms/${templateId}\`)` |
| `app/(organizer)/documents/[templateId]/loading.tsx` | **Delete** |
| `app/(organizer)/forms/[templateId]/page.tsx` | Drop the `kind === 'doc'` redirect |
| `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx` | Always redirect to `/forms/${formId}` |
| `app/__tests__/documents-redirects.test.ts` | **Create** (redirect coverage) |
| `components/shell/OrganizerShell.tsx` | One « Fichiers » rail item |
| `components/shell/RailIcons.tsx` | Delete now-unused `IconDocs` |
| `components/shell/__tests__/OrganizerShell.test.tsx` + `RailPrefetch.test.tsx` | Update rail assertions |

---

### Task 1: Grouped library helper

**Files:**
- Modify: `lib/forms/library.ts`
- Test: `lib/forms/__tests__/library.test.ts`

**Interfaces:**
- Consumes: `STANDARD_TEMPLATES` from `@/lib/forms/standard-library` (keys, in order: forms `medical, decharge, absence, famille, ast`; docs `passeport, passeport-parent, esta`).
- Produces: `libraryEntriesGrouped(existingKeys: readonly string[], query: string): GroupedLibraryEntries` where `GroupedLibraryEntries = { forms: LibraryEntry[]; docs: LibraryEntry[] }` and `LibraryEntry = StandardTemplate & { added: boolean }`. Task 3's LibraryDrawer imports both names. The existing `libraryEntries` / `LibraryFamily` stay for now (LibraryDrawer still uses them until Task 3).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/fichiers-tab-merge
```

- [ ] **Step 2: Write the failing tests** — append to `lib/forms/__tests__/library.test.ts` (keep the existing `libraryEntries` describe block for now; also add `libraryEntriesGrouped` to the import):

```ts
import { libraryEntries, libraryEntriesGrouped } from '@/lib/forms/library'
```

```ts
describe('libraryEntriesGrouped', () => {
  it('splits the whole library into forms (online+pdf) and docs (doc)', () => {
    const g = libraryEntriesGrouped([], '')
    expect(g.forms.map(e => e.key)).toEqual(['medical', 'decharge', 'absence', 'famille', 'ast'])
    expect(g.docs.map(e => e.key)).toEqual(['passeport', 'passeport-parent', 'esta'])
  })

  it('one query filters both groups on name and description, case-insensitively', () => {
    // « médicale » only matches a form; « esta » only matches a doc.
    expect(libraryEntriesGrouped([], 'MÉDICALE').forms.map(e => e.key)).toEqual(['medical'])
    expect(libraryEntriesGrouped([], 'MÉDICALE').docs).toEqual([])
    expect(libraryEntriesGrouped([], 'esta').docs.map(e => e.key)).toEqual(['esta'])
    expect(libraryEntriesGrouped([], 'esta').forms).toEqual([])
    expect(libraryEntriesGrouped([], 'zzz')).toEqual({ forms: [], docs: [] })
  })

  it('marks added entries in both groups from the combined key set', () => {
    const g = libraryEntriesGrouped(['medical', 'passeport'], '')
    expect(g.forms.find(e => e.key === 'medical')?.added).toBe(true)
    expect(g.forms.find(e => e.key === 'ast')?.added).toBe(false)
    expect(g.docs.find(e => e.key === 'passeport')?.added).toBe(true)
    expect(g.docs.find(e => e.key === 'esta')?.added).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run lib/forms/__tests__/library.test.ts`
Expected: FAIL — `libraryEntriesGrouped` is not exported.

- [ ] **Step 4: Implement** — append to `lib/forms/library.ts`:

```ts
export type GroupedLibraryEntries = { forms: LibraryEntry[]; docs: LibraryEntry[] }

// One query filters the whole standard library; entries come back grouped for
// the merged drawer's two subsections (Formulaires = online+pdf, Documents = doc).
export function libraryEntriesGrouped(
  existingKeys: readonly string[],
  query: string,
): GroupedLibraryEntries {
  const q = query.trim().toLowerCase()
  const matches = STANDARD_TEMPLATES
    .filter((std) => q === '' || std.name.toLowerCase().includes(q) || std.description.toLowerCase().includes(q))
    .map((std) => ({ ...std, added: existingKeys.includes(std.key) }))
  return {
    forms: matches.filter((e) => e.kind !== 'doc'),
    docs: matches.filter((e) => e.kind === 'doc'),
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run lib/forms/__tests__/library.test.ts`
Expected: PASS (old + new suites).

- [ ] **Step 6: Commit**

```bash
git add lib/forms/library.ts lib/forms/__tests__/library.test.ts
git commit -m "feat(forms): grouped standard-library helper for the merged Fichiers drawer"
```

---

### Task 2: i18n additions (all 5 locales)

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `messages/__tests__/parity.test.ts` (existing — must stay green)

**Interfaces:**
- Produces i18n keys consumed by Tasks 3, 4, 6: `organizer.files.{title,formsHeading,docsHeading,formsEmpty,docsEmpty}`, `organizer.library.{addTitle,formsSection,docsSection}`, `organizer.shell.nav.files`. `formsHeading`/`docsHeading` take an ICU `{count}` arg.
- Obsolete keys are NOT removed here (components still use them until Tasks 3–6); removal is Task 7.

All five files are line-aligned; each gets three edits. Values:

| key | en | fr | es | it | de |
|---|---|---|---|---|---|
| `shell.nav.files` | Files | Fichiers | Archivos | File | Dateien |
| `files.title` | Files | Fichiers | Archivos | File | Dateien |
| `files.formsHeading` | Forms · {count} | Formulaires · {count} | Formularios · {count} | Moduli · {count} | Formulare · {count} |
| `files.docsHeading` | Requested documents · {count} | Documents demandés · {count} | Documentos solicitados · {count} | Documenti richiesti · {count} | Angeforderte Unterlagen · {count} |
| `files.formsEmpty` | No forms yet. | Aucun formulaire pour le moment. | Aún no hay formularios. | Ancora nessun modulo. | Noch keine Formulare. |
| `files.docsEmpty` | No requested documents yet. | Aucun document demandé pour le moment. | Aún no hay documentos solicitados. | Ancora nessun documento richiesto. | Noch keine angeforderten Unterlagen. |
| `library.addTitle` | Add | Ajouter | Añadir | Aggiungi | Hinzufügen |
| `library.formsSection` | Forms | Formulaires | Formularios | Moduli | Formulare |
| `library.docsSection` | Documents | Documents | Documentos | Documenti | Dokumente |

- [ ] **Step 1: Add `shell.nav.files`** — in each file, the organizer `shell.nav` block (~line 300s, the one containing `"applications"`; NOT the settings `nav` block at ~line 37). Edit, e.g. fr (`messages/fr.json`):

old:
```json
        "applications": "Candid.",
        "forms": "Formul.",
```
new:
```json
        "applications": "Candid.",
        "files": "Fichiers",
        "forms": "Formul.",
```
Same shape per locale, using each locale's `applications` value as anchor — en: `"applications": "Apps.",` / es: `"applications": "Candid.",` / it: `"applications": "Candid.",` / de: `"applications": "Bewerb.",` — inserting that locale's `"files"` value from the table.

- [ ] **Step 2: Add the `files` object** — insert as a sibling right before `organizer.forms` (anchor on the unique two-line sequence `"forms": {` + `"title"`). Edit, e.g. fr:

old:
```json
    "forms": {
      "title": "Formulaires",
```
new:
```json
    "files": {
      "title": "Fichiers",
      "formsHeading": "Formulaires · {count}",
      "docsHeading": "Documents demandés · {count}",
      "formsEmpty": "Aucun formulaire pour le moment.",
      "docsEmpty": "Aucun document demandé pour le moment."
    },
    "forms": {
      "title": "Formulaires",
```
Repeat per locale with that locale's `forms.title` as anchor (en `"title": "Forms",`, es `"Formularios"`, it `"Moduli"`, de `"Formulare"`) and the table's values.

- [ ] **Step 3: Add the three `library` keys** — anchor on the `heading` line of the `library` block (~line 439). Edit, e.g. fr:

old:
```json
      "heading": "Bibliothèque",
```
new:
```json
      "heading": "Bibliothèque",
      "addTitle": "Ajouter",
      "formsSection": "Formulaires",
      "docsSection": "Documents",
```
Anchors per locale: en `"heading": "Library",` / es `"heading": "Biblioteca",` / it `"heading": "Biblioteca",` / de `"heading": "Bibliothek",`.

- [ ] **Step 4: Run the parity suite**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS (all locales share the fr key set, no empty values, same ICU args).

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "i18n: add Fichiers page, nav and library-section keys (5 locales)"
```

---

### Task 3: LibraryDrawer serves both families

**Files:**
- Modify: `components/forms/LibraryDrawer.tsx`
- Modify: `lib/forms/library.ts` (delete `libraryEntries` + `LibraryFamily`), `lib/forms/__tests__/library.test.ts` (delete the old `libraryEntries` describe block and its import)
- Modify (interim, deleted in Task 4): `components/forms/FormsView.tsx:49`, `components/documents/DocsView.tsx:50`, `components/forms/__tests__/FormsView.test.tsx`, `components/documents/__tests__/DocsView.test.tsx`
- Test: `components/forms/__tests__/LibraryDrawer.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `libraryEntriesGrouped` (Task 1), i18n keys `library.addTitle`, `library.formsSection`, `library.docsSection` (Task 2).
- Produces: `LibraryDrawer` props become `{ exchangeId: string; existingKeys: string[]; onClose: () => void; onAdded: (id: string) => void }` — no `family`. Task 4's `FichiersView` uses exactly this signature. Entry test-ids stay `lib-entry-${key}`; backdrop test-id stays `drawer-backdrop`. `CreateTemplateForm` (bottom half of the file) stays byte-identical.

- [ ] **Step 1: Rewrite the test file** — replace the full contents of `components/forms/__tests__/LibraryDrawer.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const addStandard = vi.fn()
const createDraft = vi.fn()
vi.mock('@/actions/forms', () => ({
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
}))
import { LibraryDrawer } from '@/components/forms/LibraryDrawer'

beforeEach(() => {
  addStandard.mockReset().mockResolvedValue({ ok: true, id: 'std-1' })
  createDraft.mockReset().mockResolvedValue({ ok: true, id: 'new-1' })
})

const base = { exchangeId: 'ex1', existingKeys: [] as string[], onClose: vi.fn(), onAdded: vi.fn() }

describe('LibraryDrawer', () => {
  it('lists both subsections with their entries and all three custom tiles', () => {
    renderWithIntl(<LibraryDrawer {...base} />)
    // Subsection headings
    expect(screen.getByText('Formulaires')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
    // One entry from each family
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    // All three custom tiles
    expect(screen.getByRole('button', { name: 'Téléverser un PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un formulaire en ligne' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('one search filters both subsections and hides an empty subsection', () => {
    renderWithIntl(<LibraryDrawer {...base} />)
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'absence' } })
    expect(screen.getByText('Demande d’absence')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
    // No doc matches « absence » → the Documents subsection disappears entirely
    expect(screen.getByText('Formulaires')).toBeInTheDocument()
    expect(screen.queryByText('Documents')).toBeNull()
    expect(screen.queryByText('Passeport de l’élève')).toBeNull()
  })

  it('greys already-added entries across both families (combined existingKeys)', () => {
    renderWithIntl(<LibraryDrawer {...base} existingKeys={['medical', 'passeport']} />)
    expect(within(screen.getByTestId('lib-entry-medical')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(screen.getByTestId('lib-entry-passeport')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(screen.getByTestId('lib-entry-esta')).getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('Ajouter calls addStandardTemplate and fires onAdded with the new id', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} onAdded={onAdded} />)
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('std-1'))
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('shows a structured add failure inline', async () => {
    addStandard.mockResolvedValue({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    renderWithIntl(<LibraryDrawer {...base} />)
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByText('Ce modèle est déjà ajouté à cet échange.')).toBeInTheDocument()
  })

  it('custom online tile flips to the create form and creates a draft', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} onAdded={onAdded} />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('new-1'))
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
    expect(fd.get('exchange_id')).toBe('ex1')
  })

  it('doc tile keeps the audience and condition fields', async () => {
    renderWithIntl(<LibraryDrawer {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Demander un document' }))
    fireEvent.change(screen.getByLabelText('Nom de la pièce'), { target: { value: 'CEAM' } })
    fireEvent.click(screen.getByLabelText('Selon la situation'))
    fireEvent.change(screen.getByLabelText('Condition (facultatif)'), { target: { value: 'si séjour UE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(createDraft).toHaveBeenCalled())
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('doc')
    expect(fd.get('audience')).toBe('conditional')
    expect(fd.get('condition_label')).toBe('si séjour UE')
  })

  it('Escape and backdrop close the drawer', () => {
    const onClose = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run components/forms/__tests__/LibraryDrawer.test.tsx`
Expected: FAIL — TypeScript/props mismatch (`family` missing) and sectioned-list assertions.

- [ ] **Step 3: Rewrite the top half of `components/forms/LibraryDrawer.tsx`** — everything above `CreateTemplateForm` becomes the following (`CreateTemplateForm` and its comment stay byte-identical):

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { libraryEntriesGrouped } from '@/lib/forms/library'
import { addStandardTemplate, createDraftTemplate } from '@/actions/forms'

type CreateMode = 'pdf' | 'online' | 'doc'

// Right library drawer (460px, same pattern as FormDrawer): one search box
// over the whole standard library, rendered as two subsections — Formulaires
// then Documents, an empty subsection is hidden — with an « Ajouter » per
// entry (greyed when the exchange already has that standard_key), then the
// three custom tiles which flip the drawer to the short create form — same
// fields and createDraftTemplate action as before. Adding or creating hands
// the new template id to onAdded (the view closes the drawer and opens the
// detail drawer).
export function LibraryDrawer({
  exchangeId, existingKeys, onClose, onAdded,
}: {
  exchangeId: string
  existingKeys: string[]
  onClose: () => void
  onAdded: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const grouped = libraryEntriesGrouped(existingKeys, query)
  const sections = [
    { id: 'forms', heading: t('library.formsSection'), entries: grouped.forms },
    { id: 'docs', heading: t('library.docsSection'), entries: grouped.docs },
  ].filter((s) => s.entries.length > 0)

  async function handleAdd(key: string) {
    setBusyKey(key)
    setError(null)
    try {
      const res = await addStandardTemplate(exchangeId, key)
      if (!res.ok) { setError(res.message); setBusyKey(null); return }
      onAdded(res.id)
    } catch {
      setError(c('errors.generic'))
      setBusyKey(null)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      <div data-testid="drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-rail/30" />
      <div className="absolute right-0 top-0 flex h-full w-[460px] max-w-full flex-col bg-card shadow-modal animate-[drwIn_.25s_ease-out]">
        <div className="flex flex-none items-center justify-between border-b px-[26px] pb-[18px] pt-6">
          <div className="font-display text-lg font-semibold text-navy">
            {t('library.addTitle')}
          </div>
          <button type="button" onClick={onClose} aria-label={t('forms.close')}
            className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        {createMode === null ? (
          <div className="flex-1 overflow-auto px-[26px] py-[22px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="mb-5 h-11 w-full rounded-[10px] border border-frame bg-card px-3 text-[14px] placeholder:text-placeholder focus:border-brand focus:outline-none" />

            {sections.map((section) => (
              <div key={section.id} className="mb-5">
                <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
                  {section.heading}
                </div>
                <div className="flex flex-col gap-2.5">
                  {section.entries.map((entry) => (
                    <div key={entry.key} data-testid={`lib-entry-${entry.key}`}
                      className={`rounded-xl border border-dashed border-frame p-3.5 ${entry.added ? 'opacity-45' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-display text-[13.5px] font-semibold leading-snug text-navy">{entry.name}</div>
                          <div className="mt-1 line-clamp-2 text-[12px] leading-normal text-muted-foreground">{entry.description}</div>
                        </div>
                        {entry.added ? (
                          <span className="flex-none pt-0.5 text-[11.5px] font-semibold text-muted-foreground">{t('library.alreadyAdded')}</span>
                        ) : (
                          <button type="button" disabled={busyKey !== null} onClick={() => handleAdd(entry.key)}
                            className="flex-none rounded-lg bg-subtle px-3 py-1.5 text-[12.5px] font-semibold text-navy hover:bg-hoverrow disabled:opacity-60">
                            {busyKey === entry.key ? t('library.adding') : c('actions.add')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-background" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-placeholder">{t('library.customHeading')}</span>
              <div className="h-px flex-1 bg-background" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setCreateMode('pdf')}
                className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">⤒</span> {t('library.uploadPdfTile')}
              </button>
              <button type="button" onClick={() => setCreateMode('online')}
                className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">✎</span> {t('library.createOnlineTile')}
              </button>
              <button type="button" onClick={() => setCreateMode('doc')}
                className="col-span-2 rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                <span aria-hidden="true">+</span> {t('library.requestDocTile')}
              </button>
            </div>
          </div>
        ) : (
          <CreateTemplateForm mode={createMode} exchangeId={exchangeId}
            onBack={() => setCreateMode(null)} onCreated={onAdded} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Delete the old helper** — in `lib/forms/library.ts`, remove the `LibraryFamily` type and the `libraryEntries` function (keep `LibraryEntry`, `GroupedLibraryEntries`, `libraryEntriesGrouped`), and replace the file's top comment with:

```ts
// Pure filtering for the standard-template library drawer. Source of truth
// stays STANDARD_TEMPLATES; the drawer shows both families as subsections and
// greys entries the exchange already has.
```

In `lib/forms/__tests__/library.test.ts`, delete the `libraryEntries` describe block and drop `libraryEntries` from the import.

- [ ] **Step 5: Fix the two interim call sites** (both views are deleted in Task 4; this just keeps the tree compiling):
  - `components/forms/FormsView.tsx:49`: `<LibraryDrawer family="forms" exchangeId={exchangeId} …` → `<LibraryDrawer exchangeId={exchangeId} …`
  - `components/documents/DocsView.tsx:50`: `<LibraryDrawer family="docs" exchangeId={exchangeId} …` → `<LibraryDrawer exchangeId={exchangeId} …`

- [ ] **Step 6: Fix the interim view-test assertions** (drawer now shows both families and no « Bibliothèque » heading):
  - `components/forms/__tests__/FormsView.test.tsx` — in `'« + Ajouter » opens the library drawer scoped to forms'`: delete `expect(screen.getByText('Bibliothèque')).toBeInTheDocument()` and change `expect(screen.queryByText('Passeport de l’élève')).toBeNull()` to `expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()`. In `'adding from the library closes it…'`: change `await waitFor(() => expect(screen.queryByText('Bibliothèque')).toBeNull())` to `await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull())`.
  - `components/documents/__tests__/DocsView.test.tsx` — in `'« + Ajouter » opens the library scoped to documents'`: change `expect(screen.queryByText('Autorisation médicale')).toBeNull()` to `expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()`. In `'adding a standard doc closes the library'`: change `await waitFor(() => expect(screen.queryByText('Bibliothèque')).toBeNull())` to `await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull())`.

- [ ] **Step 7: Run the affected suites**

Run: `pnpm vitest run components/forms lib/forms components/documents && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add components/forms/LibraryDrawer.tsx components/forms/__tests__/LibraryDrawer.test.tsx lib/forms/library.ts lib/forms/__tests__/library.test.ts components/forms/FormsView.tsx components/documents/DocsView.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx
git commit -m "feat(forms): LibraryDrawer serves both families as sectioned subsections"
```

---

### Task 4: FichiersView, merged data fetch, list-route redirect

**Files:**
- Create: `components/forms/FichiersView.tsx`, `components/forms/__tests__/FichiersView.test.tsx`
- Modify: `actions/forms.ts:401-427` (`getTemplatesPage`), `app/(organizer)/forms/page.tsx`, `app/(organizer)/documents/page.tsx`
- Delete: `components/forms/FormsView.tsx`, `components/forms/__tests__/FormsView.test.tsx`, `components/documents/DocsView.tsx`, `components/documents/__tests__/DocsView.test.tsx` (the whole `components/documents/__tests__/` dir — DocDrawer coverage moves into the FichiersView suite), `app/(organizer)/documents/loading.tsx`

**Interfaces:**
- Consumes: `LibraryDrawer` (Task 3 signature), `FormDrawer({ vm: TemplateVM | null, onClose })`, `DocDrawer({ vm: TemplateVM | null, exchangeId, enrolledStudents, onClose })`, i18n `files.*` keys (Task 2).
- Produces: `getTemplatesPage(exchangeId: string)` — the `family` parameter is gone; return shape unchanged (`{ templates, studentCount, enrolledStudents, exchangeName }`) now covering all kinds. `FichiersView({ exchangeId: string; templates: TemplateVM[]; enrolledStudents: { id: string; full_name: string }[] })`.

- [ ] **Step 1: Write the failing test** — create `components/forms/__tests__/FichiersView.test.tsx` (merged FormsView + DocsView suites):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FichiersView } from '@/components/forms/FichiersView'
import type { TemplateVM } from '@/lib/forms/rollup'

const form = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Formulaire de santé',
  description: 'Antécédents médicaux.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'sante', condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: ['Groupe sanguin'], assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa M', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Hugo P', submissionStatus: null },
  ],
  ...over,
})
const doc = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 'd1', kind: 'doc', status: 'active', audience: 'all', name: 'Passeport',
  description: 'Copie du passeport.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'passeport', condition_label: null, template_file_path: null, external_url: null, fields: [],
  assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa Moreau', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Yanis Benali', submissionStatus: 'submitted' },
    { assignmentId: 'a3', studentId: 's3', studentName: 'Manon Girard', submissionStatus: null },
  ],
  ...over,
})
const students = [{ id: 's1', full_name: 'Léa Moreau' }, { id: 's2', full_name: 'Yanis Benali' }]

function renderView(templates: TemplateVM[]) {
  return renderWithIntl(<FichiersView exchangeId="ex1" templates={templates} enrolledStudents={students} />)
}

describe('FichiersView', () => {
  it('renders the Fichiers title and both sections with counts and the right cards', () => {
    renderView([form({}), doc({})])
    expect(screen.getByRole('heading', { name: 'Fichiers' })).toBeInTheDocument()
    expect(screen.getByText('Formulaires · 1')).toBeInTheDocument()
    expect(screen.getByText('Documents demandés · 1')).toBeInTheDocument()
    expect(screen.getByText('Formulaire de santé')).toBeInTheDocument()
    expect(screen.getByText('Passeport')).toBeInTheDocument()
    // Exactly one « + Ajouter » button
    expect(screen.getAllByRole('button', { name: /Ajouter/ })).toHaveLength(1)
  })

  it('an empty section shows its muted hint instead of a grid', () => {
    renderView([form({})])
    expect(screen.getByText('Documents demandés · 0')).toBeInTheDocument()
    expect(screen.getByText('Aucun document demandé pour le moment.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun formulaire pour le moment.')).toBeNull()
  })

  it('the forms section empty hint shows when only docs exist', () => {
    renderView([doc({})])
    expect(screen.getByText('Aucun formulaire pour le moment.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun document demandé pour le moment.')).toBeNull()
  })

  it('clicking a form card opens the FormDrawer', () => {
    const draft = form({ id: 'f2', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderView([draft, doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    expect(screen.getByText('Questions du formulaire')).toBeInTheDocument()
  })

  it('clicking a doc card opens the DocDrawer with per-student rows', () => {
    renderView([form({}), doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    expect(screen.getByText('Suivi par élève')).toBeInTheDocument()
    expect(screen.getByText('Yanis Benali')).toBeInTheDocument()
    const reviewLink = screen.getByRole('link', { name: /À vérifier/ })
    expect(reviewLink).toHaveAttribute('href', '/exchanges/ex1/submissions/a2')
  })

  it('form drawer activation still works from a card', async () => {
    const draft = form({ id: 'f2', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('f2', undefined)
  })

  it('doc drawer relance still reports the result line', async () => {
    renderView([doc({})])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })

  it('conditional doc draft activation with student picking still works', async () => {
    const draft = doc({ id: 'd2', status: 'draft', audience: 'conditional', condition_label: 'si parents divorcés', assignees: [] })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir les élèves & activer' }))
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d2', ['s1'])
  })

  it('« + Ajouter » opens the merged library drawer (both subsections)', () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('existing standard keys from BOTH families grey the library', () => {
    renderView([form({ standard_key: 'medical', name: 'Autorisation médicale (la nôtre)' }), doc({})])
    fireEvent.click(screen.getByRole('button', { name: /^\+ Ajouter$/ }))
    expect(within(screen.getByTestId('lib-entry-medical')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(screen.getByTestId('lib-entry-passeport')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
  })

  it('adding from the library closes it and requests the new detail drawer', async () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(screen.queryByPlaceholderText('Rechercher…')).toBeNull())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('creating a custom online draft through the drawer calls createDraftTemplate', async () => {
    renderView([])
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Créer le brouillon' })).toBeNull())
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
  })

  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = form({ id: 'f2', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null, deadline: null })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })

  it('form drawer lists readiness hints for an unready draft', () => {
    const draft = form({ id: 'f9', status: 'draft', kind: 'pdf', name: 'PDF nu', deadline: null, template_file_path: null, assignees: [] })
    renderView([draft])
    fireEvent.click(screen.getByRole('button', { name: /PDF nu/ }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByText(/Téléversez le PDF avant d’activer\./)).toBeInTheDocument()
    const editLinks = screen.getAllByRole('link', { name: 'Modifier le modèle' })
    for (const l of editLinks) expect(l).toHaveAttribute('href', '/forms/f9')
  })

  it('doc drawer shows the external link when present', () => {
    renderView([doc({ external_url: 'https://esta.cbp.dhs.gov' })])
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    const link = screen.getByRole('link', { name: /esta\.cbp\.dhs\.gov/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
```

Note on `'existing standard keys…'`: after the drawer opens, per-entry « Ajouter » buttons exist, so that test targets the page button with the exact accessible name `+ Ajouter` (`/^\+ Ajouter$/`) before the drawer opens; the other tests click before any drawer button exists, where `/Ajouter/` is unambiguous.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run components/forms/__tests__/FichiersView.test.tsx`
Expected: FAIL — cannot resolve `@/components/forms/FichiersView`.

- [ ] **Step 3: Create `components/forms/FichiersView.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { type TemplateVM } from '@/lib/forms/rollup'
import { TemplateGrid } from './TemplateGrid'
import { TemplateCard } from './TemplateCard'
import { LibraryDrawer } from './LibraryDrawer'
import { FormDrawer } from './FormDrawer'
import { DocDrawer } from '@/components/documents/DocDrawer'

// Merged « Fichiers » page (replaces FormsView + DocsView): one « + Ajouter »
// button, two sections — Formulaires (online+pdf) then Documents demandés
// (doc) — over the shared grid/cards. The detail drawer opens by kind:
// FormDrawer for online/pdf, DocDrawer for doc.
export function FichiersView({
  exchangeId, templates, enrolledStudents,
}: {
  exchangeId: string
  templates: TemplateVM[]
  enrolledStudents: { id: string; full_name: string }[]
}) {
  const [showLibrary, setShowLibrary] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  const forms = templates.filter(tpl => tpl.kind !== 'doc')
  const docs = templates.filter(tpl => tpl.kind === 'doc')
  const open = openId ? templates.find(tpl => tpl.id === openId) ?? null : null
  const existingKeys = templates
    .map(tpl => tpl.standard_key)
    .filter((k): k is string => k !== null)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px] flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{t('files.title')}</h1>
        <button type="button" onClick={() => setShowLibrary(true)}
          className="inline-flex items-center gap-[7px] rounded-[9px] bg-brand px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-brand-hover">
          <span className="text-[15px] leading-none">+</span> {c('actions.add')}
        </button>
      </div>

      <div className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        {t('files.formsHeading', { count: forms.length })}
      </div>
      {forms.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('files.formsEmpty')}</p>
      ) : (
        <TemplateGrid>
          {forms.map(tpl => (
            <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
          ))}
        </TemplateGrid>
      )}

      <div className="mb-3.5 mt-8 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
        {t('files.docsHeading', { count: docs.length })}
      </div>
      {docs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('files.docsEmpty')}</p>
      ) : (
        <TemplateGrid>
          {docs.map(tpl => (
            <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
          ))}
        </TemplateGrid>
      )}

      {showLibrary && (
        <LibraryDrawer exchangeId={exchangeId} existingKeys={existingKeys}
          onClose={() => setShowLibrary(false)}
          onAdded={(id) => { setShowLibrary(false); setOpenId(id) }} />
      )}
      <FormDrawer vm={open && open.kind !== 'doc' ? open : null} onClose={() => setOpenId(null)} />
      <DocDrawer vm={open && open.kind === 'doc' ? open : null} exchangeId={exchangeId}
        enrolledStudents={enrolledStudents} onClose={() => setOpenId(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Drop `family` from `getTemplatesPage`** — in `actions/forms.ts`, change the signature (line 401) and delete the kind filter (lines 417 and 424):

old:
```ts
export async function getTemplatesPage(exchangeId: string, family: 'forms' | 'docs'): Promise<{
```
new:
```ts
export async function getTemplatesPage(exchangeId: string): Promise<{
```

Delete the line `const kinds: TemplateKind[] = family === 'forms' ? ['online', 'pdf'] : ['doc']` and the query line `.in('kind', kinds)`. (`TemplateKind` stays imported — `createDraftTemplate` uses it at line 123.)

- [ ] **Step 5: Rewire the two pages.** Replace `app/(organizer)/forms/page.tsx` with:

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { getTemplatesPage } from '@/actions/forms'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { FichiersView } from '@/components/forms/FichiersView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function FormsPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const { templates, enrolledStudents } = await getTemplatesPage(active.id)
  return <FichiersView exchangeId={active.id} templates={templates} enrolledStudents={enrolledStudents} />
}
```

Replace `app/(organizer)/documents/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

// The Docs tab merged into « Fichiers » (/forms) — 2026-07-18 spec.
export default function DocumentsPage() {
  redirect('/forms')
}
```

- [ ] **Step 6: Delete the superseded files**

```bash
git rm components/forms/FormsView.tsx components/forms/__tests__/FormsView.test.tsx
git rm components/documents/DocsView.tsx components/documents/__tests__/DocsView.test.tsx
git rm "app/(organizer)/documents/loading.tsx"
```

- [ ] **Step 7: Run to verify pass**

Run: `pnpm vitest run components/forms && npx tsc --noEmit`
Expected: PASS (FichiersView + LibraryDrawer suites), no type errors.

- [ ] **Step 8: Commit**

```bash
git add components/forms/FichiersView.tsx components/forms/__tests__/FichiersView.test.tsx actions/forms.ts "app/(organizer)/forms/page.tsx" "app/(organizer)/documents/page.tsx"
git commit -m "feat(forms): merged Fichiers page replaces FormsView/DocsView; /documents redirects"
```

---

### Task 5: Detail routes, legacy redirect, revalidatePath collapse

**Files:**
- Modify: `app/(organizer)/forms/[templateId]/page.tsx`, `app/(organizer)/documents/[templateId]/page.tsx`, `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx`, `actions/forms.ts` (lines 179, 198, 233, 295, 335), `actions/__tests__/add-standard-template.test.ts:98`
- Delete: `app/(organizer)/documents/[templateId]/loading.tsx`
- Create (test): `app/__tests__/documents-redirects.test.ts`

**Interfaces:**
- Consumes: nothing new. `pages.formDetail.backLabel` i18n key (existing, stays).
- Produces: `/forms/[templateId]` serves ALL kinds via `TemplateEditor` with `backHref="/forms"`. The doc-kind branch removal and the `/documents/[templateId]` redirect MUST land together — removing only one of the two would create a `/forms/x ↔ /documents/x` redirect loop.

- [ ] **Step 1: Write the failing redirect tests** — create `app/__tests__/documents-redirects.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

const redirect = vi.fn((url: string) => { throw new Error('REDIRECT:' + url) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))

import DocumentsPage from '@/app/(organizer)/documents/page'
import EditDocumentPage from '@/app/(organizer)/documents/[templateId]/page'

async function getRedirect(run: () => unknown): Promise<string> {
  try { await run() } catch (e) { return (e as Error).message.replace('REDIRECT:', '') }
  throw new Error('no redirect happened')
}

describe('legacy /documents routes', () => {
  it('/documents redirects to /forms', async () => {
    expect(await getRedirect(() => DocumentsPage())).toBe('/forms')
  })

  it('/documents/[templateId] redirects to /forms/[templateId]', async () => {
    expect(await getRedirect(() =>
      EditDocumentPage({ params: Promise.resolve({ templateId: 't42' }) })
    )).toBe('/forms/t42')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run app/__tests__/documents-redirects.test.ts`
Expected: FAIL — the `[templateId]` page still renders `TemplateEditor` (its imports of `getTemplate`/next-intl will error or no redirect fires).

- [ ] **Step 3: Convert the detail route.** Replace `app/(organizer)/documents/[templateId]/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

// Doc templates are edited under /forms/[templateId] since the Fichiers merge.
export default async function EditDocumentPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  redirect(`/forms/${templateId}`)
}
```

Delete the loading skeleton:

```bash
git rm "app/(organizer)/documents/[templateId]/loading.tsx"
```

- [ ] **Step 4: `/forms/[templateId]` serves every kind.** Replace `app/(organizer)/forms/[templateId]/page.tsx` with:

```tsx
import { getTranslations } from 'next-intl/server'
import { getTemplate } from '@/actions/forms'
import { TemplateEditor } from '@/components/forms/TemplateEditor'

export default async function EditFormPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const template = await getTemplate(templateId)
  const t = await getTranslations('organizer')
  return <TemplateEditor template={template} backHref="/forms" backLabel={t('pages.formDetail.backLabel')} />
}
```

- [ ] **Step 5: Legacy exchange route always targets `/forms`.** Replace `app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx` with:

```tsx
import { redirect, notFound } from 'next/navigation'
import { getTemplate } from '@/actions/forms'

// Phase 3: template editing moved to the session-scoped /forms/[templateId].
export default async function LegacyFormTemplatePage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params
  try {
    await getTemplate(formId)
  } catch {
    notFound()
  }
  redirect(`/forms/${formId}`)
}
```

- [ ] **Step 6: Collapse the conditional revalidates.** In `actions/forms.ts`, replace each of these five lines (179, 198, 233, 295, 335):

```ts
  revalidatePath(kind === 'doc' ? '/documents' : '/forms', 'layout')
  revalidatePath(std.kind === 'doc' ? '/documents' : '/forms', 'layout')
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')   // ×3
```
with:
```ts
  revalidatePath('/forms', 'layout')
```

- [ ] **Step 7: Update the action test.** In `actions/__tests__/add-standard-template.test.ts:98`:

old: `expect(revalidatePath).toHaveBeenCalledWith('/documents', 'layout')`
new: `expect(revalidatePath).toHaveBeenCalledWith('/forms', 'layout')`

- [ ] **Step 8: Run to verify pass**

Run: `pnpm vitest run app/__tests__/documents-redirects.test.ts actions/__tests__/add-standard-template.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add "app/(organizer)/documents/[templateId]/page.tsx" "app/(organizer)/forms/[templateId]/page.tsx" "app/(organizer)/exchanges/[id]/forms/[formId]/page.tsx" actions/forms.ts actions/__tests__/add-standard-template.test.ts app/__tests__/documents-redirects.test.ts
git commit -m "feat(forms): /forms/[id] serves all kinds; /documents/* redirects; revalidate /forms only"
```

---

### Task 6: One « Fichiers » rail item

**Files:**
- Modify: `components/shell/OrganizerShell.tsx` (imports line 9, rail items lines 171–176), `components/shell/RailIcons.tsx` (delete `IconDocs`)
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`, `components/shell/__tests__/RailPrefetch.test.tsx`

**Interfaces:**
- Consumes: i18n key `shell.nav.files` (Task 2). Active-state styling on `RailItem` is the `bg-white/10` class (assertable via `toHaveClass`).
- Produces: nothing downstream.

- [ ] **Step 1: Update the shell tests first.** In `components/shell/__tests__/OrganizerShell.test.tsx`, replace the test `'shows Formul. and Docs rail items when an exchange is active'` (lines 137–143) with:

```tsx
  it('shows one Fichiers rail item pointing at /forms', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Fichiers')).toBeInTheDocument()
    expect(screen.queryByText('Formul.')).toBeNull()
    expect(screen.queryByText('Docs')).toBeNull()
    expect(screen.getByText('Fichiers').closest('a')).toHaveAttribute('href', '/forms')
  })

  it('Fichiers is active on both /forms and /documents path prefixes', () => {
    const { unmount } = renderShell({ pathname: '/forms' })
    expect(screen.getByText('Fichiers').closest('a')).toHaveClass('bg-white/10')
    unmount()
    renderShell({ pathname: '/documents/t1' })
    expect(screen.getByText('Fichiers').closest('a')).toHaveClass('bg-white/10')
  })
```

Delete the now-redundant test `'shows no top-bar search or create button on /documents'` (lines 151–155 — the route is a redirect now; the `/forms` variant above it stays).

In `components/shell/__tests__/RailPrefetch.test.tsx:36`, change the label list:

old: `for (const label of ['Aperçu', 'Échanges', 'Candid.', 'Formul.', 'Docs', 'Élèves']) {`
new: `for (const label of ['Aperçu', 'Échanges', 'Candid.', 'Fichiers', 'Élèves']) {`

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run components/shell`
Expected: FAIL — rail still renders « Formul. » and « Docs ».

- [ ] **Step 3: Merge the rail items.** In `components/shell/OrganizerShell.tsx`, replace lines 171–176:

old:
```tsx
              <RailItem href="/forms" label={t('shell.nav.forms')} active={pathname.startsWith('/forms')}>
                <IconForms />
              </RailItem>
              <RailItem href="/documents" label={t('shell.nav.documents')} active={pathname.startsWith('/documents')}>
                <IconDocs />
              </RailItem>
```
new (active also covers `/documents` for the redirect flash):
```tsx
              <RailItem href="/forms" label={t('shell.nav.files')} active={pathname.startsWith('/forms') || pathname.startsWith('/documents')}>
                <IconForms />
              </RailItem>
```

Update the import on line 9:

old: `import { IconOverview, IconExchanges, IconApplications, IconForms, IconDocs, IconStudents, IconFeedback } from './RailIcons'`
new: `import { IconOverview, IconExchanges, IconApplications, IconForms, IconStudents, IconFeedback } from './RailIcons'`

In `components/shell/RailIcons.tsx`, delete the whole `IconDocs` function (lines 39–46, now unused).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run components/shell && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/RailIcons.tsx components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx
git commit -m "feat(shell): single Fichiers rail tab replaces Formul. + Docs"
```

---

### Task 7: Remove obsolete i18n keys + full gate

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`

**Interfaces:**
- Consumes: every component change from Tasks 3–6 (no consumer of these keys may remain). Keys that STAY (still used): `forms.close`, `forms.deleteConfirm`, `forms.addPanel.*`, `forms.drawer.*`, `forms.editor.*`, `forms.pills`, `forms.progress`, all `documents.*` except the three below, `pages.formDetail`, `library.*` except `heading`.

Keys to delete from **all five** locale files (values per locale shown for the Edit anchors):

| key path | en | fr | es | it | de |
|---|---|---|---|---|---|
| `shell.nav.forms` | Forms | Formul. | Formul. | Mod. | Formul. |
| `shell.nav.documents` | Docs | Docs | Docs | Doc. | Dok. |
| `forms.title` | Forms | Formulaires | Formularios | Moduli | Formulare |
| `forms.yourFormsCount` | Your forms · {count} | Vos formulaires · {count} | Sus formularios · {count} | I tuoi moduli · {count} | Ihre Formulare · {count} |
| `forms.addFormLabel` | Add a form | Ajouter un formulaire | Añadir un formulario | Aggiungi un modulo | Formular hinzufügen |
| `documents.title` | Documents | Documents | Documentos | Documenti | Dokumente |
| `documents.requestedHeading` | Requested documents · {count} | Pièces demandées · {count} | Documentos solicitados · {count} | Documenti richiesti · {count} | Angeforderte Unterlagen · {count} |
| `documents.addDocLabel` | Request a document | Demander un document | Solicitar un documento | Richiedi un documento | Dokument anfordern |
| `pages.documentDetail` (whole object) | Back to documents | Retour aux documents | Volver a documentos | Torna ai documenti | Zurück zu den Dokumenten |
| `library.heading` | Library | Bibliothèque | Biblioteca | Biblioteca | Bibliothek |

- [ ] **Step 1: Confirm no remaining consumers** (must print nothing):

```bash
grep -rn "nav\.forms\|nav\.documents\|forms\.title\|yourFormsCount\|addFormLabel\|documents\.title\|requestedHeading\|addDocLabel\|documentDetail\|library\.heading" --include="*.ts" --include="*.tsx" app components lib actions
```

If anything prints, a Task 3–6 step was missed — fix that first, don't delete the key.

- [ ] **Step 2: Delete the keys.** Per locale file, four Edit operations (fr shown; other locales use the same shape with their values from the table):

Nav — old:
```json
        "files": "Fichiers",
        "forms": "Formul.",
        "documents": "Docs",
```
new:
```json
        "files": "Fichiers",
```

Forms block — old:
```json
    "forms": {
      "title": "Formulaires",
      "yourFormsCount": "Vos formulaires · {count}",
      "addFormLabel": "Ajouter un formulaire",
      "close": "Fermer",
```
new:
```json
    "forms": {
      "close": "Fermer",
```

Documents block — old:
```json
    "documents": {
      "title": "Documents",
      "requestedHeading": "Pièces demandées · {count}",
      "addDocLabel": "Demander un document",
      "close": "Fermer",
```
new:
```json
    "documents": {
      "close": "Fermer",
```
(en uses `"close": "Close",`, es `"Cerrar",`, it `"Chiudi",`, de `"Schließen",` in both blocks.)

Pages + library — old:
```json
      "documentDetail": {
        "backLabel": "Retour aux documents"
      },
```
new: (nothing — delete the object), and old:
```json
      "heading": "Bibliothèque",
```
new: (nothing — delete the line).

- [ ] **Step 3: Full verification gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
```
Expected: all green — parity suite proves the five catalogs still match; component suites prove no key is referenced after deletion.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "i18n: drop obsolete Formulaires/Docs tab keys (5 locales)"
```

---

## Completion

After Task 7, follow **superpowers:finishing-a-development-branch** — the branch is PR/merge-ready (no migration, no edge-function change, no env change). Optional browser spot-check for Bjorn: `/forms` shows both sections; « + Ajouter » shows the sectioned library with three tiles; a `/documents/<doc-id>` bookmark lands on the editor; the rail shows a single « Fichiers » tab highlighted from both routes.
