# Forms & Documents Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the slab-list layout of `/forms` and `/documents` with a grid of portrait "A4 paper" cards previewing each document, and move the standard-template library out of auto-seeding into a searchable right-side drawer.

**Architecture:** Pure display logic lives in small `lib/forms/*` modules (tested with `createTranslator`); new client components (`TemplateCard`, `TemplateGrid`, `TemplateThumbnail`, `LibraryDrawer`) compose them; `FormsView`/`DocsView` are rewritten around the grid; a new `addStandardTemplate` server action replaces `seedStandardTemplates` (deleted); one data-only cleanup migration removes pristine seeded drafts. PDF thumbnails are client-rendered with `pdfjs-dist` (dynamic import only), cached in localStorage keyed by `template_file_path`.

**Tech Stack:** Next.js 15 (App Router), React 19, next-intl v4, Tailwind, vitest + @testing-library/react, Supabase, `pdfjs-dist` (new dependency).

**Spec:** `docs/superpowers/specs/2026-07-16-forms-page-redesign-design.md` (approved). Mockups: `.superpowers/brainstorm/15268-1784233102/content/card-layout-v2.html` (card), `library-layout.html` option A (drawer).

## Global Constraints

- **Branch:** all work on `feature/forms-page-redesign` (created in Task 1). Never push to `main`.
- **i18n:** every new user-visible string goes through next-intl in ALL 5 catalogs (`messages/{en,fr,es,it,de}.json`) in the same task that introduces it — the parity test (`messages/__tests__/parity.test.ts`) fails otherwise. French is the reference copy.
- **Error redaction convention:** server actions return structured `{ ok, message }` for expected outcomes; only throw for genuinely unexpected failures. Auth errors throw `'Unauthenticated'` / `'Unauthorized'` (load-bearing strings).
- **Package manager is pnpm.** Run tests with `pnpm vitest run <file>` (uses `vitest.config.ts`, jsdom).
- **`git add` only the files named in each commit step** — never `git add -A` or a directory (PII guardrail).
- **`pdfjs-dist` must never enter the main bundle** — dynamic `import()` only, inside `TemplateThumbnail`.
- **Migration workflow:** the cleanup migration is applied to STAGING during execution (Task 3); the PROD apply (MCP `apply_migration`) is a **merge-time step** listed in the PR body — do not touch prod from the branch.
- **French copy uses vous-form and typographic apostrophes (’)**, matching existing catalogs.
- Detail drawers `FormDrawer` / `DocDrawer` and the editors are **unchanged** by this project.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/forms/standard-library.ts` | Modify | `STANDARD_TEMPLATES` + new `insertStandardTemplate`; `seedStandardTemplates` deleted (Task 2) |
| `actions/forms.ts` | Modify | new `addStandardTemplate` server action |
| `actions/exchanges.ts` | Modify | stop auto-seeding in `createExchange` |
| `supabase/migrations/<ts>_drop_pristine_seeded_drafts.sql` | Create | data-only cleanup of pristine seeded drafts |
| `lib/forms/card.ts` | Create | pure card display logic: `previewMode`, `cardCountLabel` |
| `lib/forms/thumbnail-cache.ts` | Create | memory + localStorage thumbnail cache (cap 20, oldest-evicted) |
| `lib/forms/library.ts` | Create | pure library filtering: `libraryEntries` |
| `components/forms/TemplateThumbnail.tsx` | Create | lazy client PDF page-1 renderer with silent fallback |
| `components/forms/TemplateCard.tsx` | Create | portrait A4 card (all 4 preview modes) |
| `components/forms/TemplateGrid.tsx` | Create | responsive 4/3/2/1 grid |
| `components/forms/LibraryDrawer.tsx` | Create | right drawer: search, standard entries, custom-create flip |
| `components/forms/FormsView.tsx` | Rewrite | header + toolbar + grid + drawers |
| `components/documents/DocsView.tsx` | Rewrite | header + toolbar + grid + drawers |
| `app/(organizer)/forms/page.tsx`, `app/(organizer)/documents/page.tsx` | Modify | drop `studentCount` prop |
| `components/forms/StatsCard.tsx`, `components/forms/PageBanner.tsx`, `components/forms/AddFormPanel.tsx`, `components/documents/AddDocPanel.tsx`, `components/forms/DeleteTemplateButton.tsx` | Delete | no consumer remains after rewrite |
| `messages/{en,fr,es,it,de}.json` | Modify | add `organizer.templateCard` + `organizer.library` keys; prune dead keys |
| `vitest.setup.ts` | Modify | no-op `IntersectionObserver` stub for jsdom |

---

### Task 1: `insertStandardTemplate` helper + `addStandardTemplate` server action

**Files:**
- Modify: `lib/forms/standard-library.ts`
- Modify: `actions/forms.ts`
- Test: `actions/__tests__/add-standard-template.test.ts` (create)

**Interfaces:**
- Consumes: existing `requireUser`/`requireOrganizer` (`lib/auth/require.ts`), `assertExchangeWritable` (`lib/exchange-guard.ts`), `CreateTemplateResult` (`lib/forms/template-result.ts`), `STANDARD_TEMPLATES`.
- Produces: `insertStandardTemplate(supabase, std, opts): Promise<{ id: string } | { duplicate: true }>` and server action `addStandardTemplate(exchangeId: string, standardKey: string): Promise<CreateTemplateResult>` (`{ ok: true; id: string } | { ok: false; message: string }`). Task 9's `LibraryDrawer` calls `addStandardTemplate`.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b feature/forms-page-redesign
```

- [ ] **Step 2: Write the failing test**

Create `actions/__tests__/add-standard-template.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  role: 'organizer' | 'student'
  archived: boolean
  dupInsert: boolean
}
let inserted: { templates: any[]; slots: any[]; fields: any[] }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({
          data: { school_id: 's1', role: scenario.role }, error: null,
        }) }) }) }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { archived_at: scenario.archived ? '2026-01-01T00:00:00Z' : null },
        }) }) }) }
      }
      if (table === 'form_templates') {
        return { insert: (row: any) => ({ select: () => ({ single: async () => {
          if (scenario.dupInsert) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "form_templates_standard_key_unique"' } }
          }
          inserted.templates.push(row)
          return { data: { id: 'tpl-new' }, error: null }
        } }) }) }
      }
      if (table === 'document_slots') {
        return { insert: async (rows: any) => { inserted.slots.push(...[].concat(rows)); return { error: null } } }
      }
      if (table === 'form_fields') {
        return { insert: async (rows: any) => { inserted.fields.push(...[].concat(rows)); return { error: null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { addStandardTemplate } from '../forms'

beforeEach(() => {
  scenario = { role: 'organizer', archived: false, dupInsert: false }
  inserted = { templates: [], slots: [], fields: [] }
  revalidatePath.mockClear()
})

describe('addStandardTemplate', () => {
  it('rejects a student caller', async () => {
    scenario.role = 'student'
    await expect(addStandardTemplate('ex1', 'medical')).rejects.toThrow('Unauthorized')
  })

  it('rejects an archived exchange', async () => {
    scenario.archived = true
    await expect(addStandardTemplate('ex1', 'medical')).rejects.toThrow('Programme archivé — lecture seule.')
  })

  it('returns a structured error for an unknown key (never throws)', async () => {
    const res = await addStandardTemplate('ex1', 'nope')
    expect(res).toEqual({ ok: false, message: 'Modèle standard inconnu.' })
    expect(inserted.templates).toHaveLength(0)
  })

  it('returns a friendly duplicate message on the unique-index violation', async () => {
    scenario.dupInsert = true
    const res = await addStandardTemplate('ex1', 'medical')
    expect(res).toEqual({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('inserts medical as a draft with slot + 9 fields and revalidates /forms', async () => {
    const res = await addStandardTemplate('ex1', 'medical')
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(inserted.templates[0]).toMatchObject({
      exchange_id: 'ex1', school_id: 's1', standard_key: 'medical',
      kind: 'pdf', type: 'document_upload', status: 'draft', audience: 'all',
      deadline: null, created_by: 'u1',
    })
    expect(inserted.slots).toHaveLength(1)
    expect(inserted.slots[0]).toMatchObject({ template_id: 'tpl-new', label: 'Autorisation médicale', required: true, order: 0 })
    expect(inserted.fields).toHaveLength(9)
    expect(revalidatePath).toHaveBeenCalledWith('/forms', 'layout')
  })

  it('revalidates /documents for a doc-kind key', async () => {
    const res = await addStandardTemplate('ex1', 'passeport')
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(inserted.fields).toHaveLength(0)
    expect(revalidatePath).toHaveBeenCalledWith('/documents', 'layout')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run actions/__tests__/add-standard-template.test.ts`
Expected: FAIL — `addStandardTemplate` is not exported from `../forms`.

- [ ] **Step 4: Refactor `seedStandardTemplates`'s loop body into `insertStandardTemplate`**

In `lib/forms/standard-library.ts`, add above `seedStandardTemplates`:

```ts
// Insert ONE library entry as a draft template (+ document slot / fields).
// The partial unique index form_templates_standard_key_unique makes a repeat
// add an expected outcome — surfaced as { duplicate: true }, never thrown.
export async function insertStandardTemplate(
  supabase: SupabaseClient,
  std: StandardTemplate,
  opts: { exchangeId: string; schoolId: string; userId: string },
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await supabase
    .from('form_templates')
    .insert({
      exchange_id: opts.exchangeId,
      school_id: opts.schoolId,
      name: std.name,
      description: std.description,
      type: std.kind === 'online' ? 'data_entry' : 'document_upload',
      kind: std.kind,
      status: 'draft',
      audience: std.audience,
      standard_key: std.key,
      condition_label: std.condition_label,
      external_url: std.external_url,
      deadline: null,
      created_by: opts.userId,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    throw error
  }
  const templateId = data.id as string

  if (std.kind !== 'online') {
    const { error: slotError } = await supabase
      .from('document_slots')
      .insert({ template_id: templateId, label: std.name, description: null, required: true, order: 0 })
    if (slotError) throw slotError
  }
  if (std.fields.length > 0) {
    const { error: fieldError } = await supabase
      .from('form_fields')
      .insert(std.fields.map((f, i) => ({
        template_id: templateId, label: f.label, field_type: f.field_type, required: true, order: i,
      })))
    if (fieldError) throw fieldError
  }
  return { id: templateId }
}
```

Replace `seedStandardTemplates`'s body with:

```ts
export async function seedStandardTemplates(
  supabase: SupabaseClient,
  opts: { exchangeId: string; schoolId: string; userId: string },
): Promise<void> {
  for (const std of STANDARD_TEMPLATES) {
    await insertStandardTemplate(supabase, std, opts)
  }
}
```

- [ ] **Step 5: Add the `addStandardTemplate` action**

In `actions/forms.ts`, add to the imports:

```ts
import { STANDARD_TEMPLATES, insertStandardTemplate } from '@/lib/forms/standard-library'
```

Add after `createDraftTemplate`:

```ts
// Add one standard-library template to an exchange as a draft. The library
// drawer's « Ajouter » button. Duplicate adds (unique index on
// (exchange_id, standard_key)) are an expected outcome → structured message.
export async function addStandardTemplate(exchangeId: string, standardKey: string): Promise<CreateTemplateResult> {
  const supabase = await createClient()
  const user = await requireUser()
  const schoolId = await assertOrganizer()
  await assertExchangeWritable(supabase, exchangeId)

  const std = STANDARD_TEMPLATES.find((s) => s.key === standardKey)
  if (!std) return { ok: false, message: 'Modèle standard inconnu.' }

  const res = await insertStandardTemplate(supabase, std, { exchangeId, schoolId, userId: user.id })
  if ('duplicate' in res) return { ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' }

  revalidatePath(std.kind === 'doc' ? '/documents' : '/forms', 'layout')
  return { ok: true, id: res.id }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/add-standard-template.test.ts lib/forms/__tests__/standard-library.test.ts`
Expected: PASS (both files — the seed test proves the refactor is behavior-neutral).

- [ ] **Step 7: Commit**

```bash
git add actions/__tests__/add-standard-template.test.ts actions/forms.ts lib/forms/standard-library.ts
git commit -m "feat(forms): addStandardTemplate action + insertStandardTemplate helper"
```

---

### Task 2: Stop auto-seeding new exchanges

**Files:**
- Modify: `actions/exchanges.ts` (remove import line 15 and the `seedStandardTemplates` call at ~line 96)
- Modify: `lib/forms/standard-library.ts` (delete `seedStandardTemplates`)
- Modify: `actions/__tests__/create-exchange.test.ts`
- Modify: `lib/forms/__tests__/standard-library.test.ts`

**Interfaces:**
- Consumes: Task 1's `insertStandardTemplate` (stays; now the only insert path).
- Produces: `createExchange` no longer touches `form_templates`; `seedStandardTemplates` no longer exists anywhere.

- [ ] **Step 1: Update the tests to expect no seeding**

In `actions/__tests__/create-exchange.test.ts`:
- Delete the `form_templates` and `document_slots' || 'form_fields` branches from `makeClient` (lines 45–50) — the trailing `throw new Error('unexpected table ' + table)` now guards against any template writes.
- Change the assertion `expect(calls.fromTables).toContain('form_templates')` to:

```ts
    expect(calls.fromTables).not.toContain('form_templates')
```

In `lib/forms/__tests__/standard-library.test.ts`:
- Remove `seedStandardTemplates` from the import and replace the whole `describe('seedStandardTemplates', …)` block with an equivalent one for the helper (same mock client, single entry):

```ts
import { STANDARD_TEMPLATES, insertStandardTemplate } from '@/lib/forms/standard-library'
```

```ts
describe('insertStandardTemplate', () => {
  function harness() {
    const templateInserts: any[] = []
    const slotInserts: any[] = []
    const fieldInserts: any[] = []
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'form_templates') {
          return { insert: (row: any) => ({ select: () => ({ single: async () => {
            templateInserts.push(row); return { data: { id: 't1' }, error: null }
          } }) }) }
        }
        if (table === 'document_slots') {
          return { insert: async (rows: any) => { slotInserts.push(...[].concat(rows)); return { error: null } } }
        }
        return { insert: async (rows: any) => { fieldInserts.push(...[].concat(rows)); return { error: null } } }
      }),
    }
    return { supabase, templateInserts, slotInserts, fieldInserts }
  }

  it('inserts a draft with slot and fields for medical', async () => {
    const { supabase, templateInserts, slotInserts, fieldInserts } = harness()
    const std = STANDARD_TEMPLATES.find(t => t.key === 'medical')!
    const res = await insertStandardTemplate(supabase as any, std, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1' })
    expect(res).toEqual({ id: 't1' })
    expect(templateInserts[0]).toMatchObject({
      exchange_id: 'ex1', school_id: 's1', standard_key: 'medical', status: 'draft', deadline: null,
    })
    expect(slotInserts).toHaveLength(1)
    expect(fieldInserts).toHaveLength(9)
  })

  it('maps a 23505 insert error to { duplicate: true }', async () => {
    const supabase = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({
        data: null, error: { code: '23505', message: 'duplicate' },
      }) }) }) }),
    }
    const std = STANDARD_TEMPLATES.find(t => t.key === 'passeport')!
    const res = await insertStandardTemplate(supabase as any, std, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1' })
    expect(res).toEqual({ duplicate: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run actions/__tests__/create-exchange.test.ts lib/forms/__tests__/standard-library.test.ts`
Expected: FAIL — create-exchange still calls `from('form_templates')`.

- [ ] **Step 3: Remove the seeding**

In `actions/exchanges.ts`: delete `import { seedStandardTemplates } from '@/lib/forms/standard-library'` and the whole `await seedStandardTemplates(supabase, { … })` call inside `createExchange`.

In `lib/forms/standard-library.ts`: delete the `seedStandardTemplates` function and its comment; update the module header comment (first 5 lines) to:

```ts
// Canonical standard-template library. Since the forms-page redesign
// (2026-07-16) nothing is auto-seeded: organizers add entries from the
// library drawer (actions/forms.ts → addStandardTemplate). Templates are
// added WITHOUT files — the PDFs are school-specific, so each school's
// organizer attaches their own per exchange via the UI.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/create-exchange.test.ts lib/forms/__tests__/standard-library.test.ts actions/__tests__/add-standard-template.test.ts`
Expected: PASS. Also run `grep -rn "seedStandardTemplates" --include="*.ts" --include="*.tsx" . | grep -v node_modules` — expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add actions/exchanges.ts lib/forms/standard-library.ts actions/__tests__/create-exchange.test.ts lib/forms/__tests__/standard-library.test.ts
git commit -m "feat(exchanges): stop auto-seeding standard templates on exchange creation"
```

---

### Task 3: Cleanup migration — delete pristine seeded drafts

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_drop_pristine_seeded_drafts.sql` (timestamp from `date +%Y%m%d%H%M%S`)

**Interfaces:**
- Produces: existing exchanges lose their untouched auto-seeded drafts, matching the new empty-grid experience. No schema, RLS, or policy change.

- [ ] **Step 1: Write the migration**

```sql
-- The library drawer replaces auto-seeding (forms-page redesign 2026-07-16):
-- new exchanges start with an empty grid and organizers add standard templates
-- explicitly. Give existing exchanges the same clean slate by deleting the
-- auto-seeded drafts that are still pristine — draft status, no attached PDF,
-- no assignments. form_fields, document_slots and assignments cascade.
delete from form_templates
where standard_key is not null
  and status = 'draft'
  and template_file_path is null
  and not exists (select 1 from assignments a where a.template_id = form_templates.id);
```

- [ ] **Step 2: Apply to STAGING (never prod from this branch)**

```bash
set -a; source .env.staging; set +a
npx supabase db push --db-url "$STAGING_DB_URL"
```

Expected: the new migration applies cleanly. (WSL2 gotcha: if the push hangs, resolve the pooler host with `getent ahostsv4` and substitute the IPv4 address into the URL — see memory `reference_wsl2_supabase_db_push_ipv6`. If push refuses due to pre-existing ledger drift, apply the file's SQL directly with `psql "$STAGING_DB_URL" -f <file>` as done for prior migrations.)

- [ ] **Step 3: Run the RLS regression matrix**

Run: `pnpm test:rls`
Expected: PASS (data-only migration — the matrix proves no policy regressed). If the local stack/`RLS_TEST_DB_URL` is unavailable, stop and report — this gate is mandatory for any `supabase/migrations/` change.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_drop_pristine_seeded_drafts.sql
git commit -m "feat(db): drop pristine auto-seeded draft templates (library replaces seeding)"
```

**Merge-time step (record in PR body):** apply this migration to prod via MCP `apply_migration` (name = `drop_pristine_seeded_drafts`), then check `list_migrations` and `git mv` the file if the stamped version differs. Apply only when this PR merges — deleting prod drafts before the drawer UI ships would strand organizers without a re-add path.

---

### Task 4: Card display logic (`lib/forms/card.ts`)

**Files:**
- Create: `lib/forms/card.ts`
- Test: `lib/forms/__tests__/card.test.ts`

**Interfaces:**
- Consumes: `TemplateVM`, `progressLabel` from `lib/forms/rollup.ts`.
- Produces: `previewMode(t): 'pdf-file' | 'pdf-missing' | 'online-paper' | 'doc-placeholder'` and `cardCountLabel(tpl, t): string`. Task 7's `TemplateCard` consumes both.

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/card.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import { previewMode, cardCountLabel } from '@/lib/forms/card'
import type { TemplateVM, AssigneeRow } from '@/lib/forms/rollup'

const t = createTranslator({ locale: 'fr', messages: fr })

const a = (id: string, s: AssigneeRow['submissionStatus']): AssigneeRow =>
  ({ assignmentId: `as-${id}`, studentId: id, studentName: `Élève ${id}`, submissionStatus: s })

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Autorisation',
  description: null, deadline: '2026-10-10T00:00:00+00:00', standard_key: null,
  condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: [], assignees: [], ...over,
})

describe('previewMode', () => {
  it('pdf with a file renders the real thumbnail', () => {
    expect(previewMode(vm({}))).toBe('pdf-file')
  })
  it('pdf draft without file shows the attach placeholder', () => {
    expect(previewMode(vm({ status: 'draft', template_file_path: null }))).toBe('pdf-missing')
  })
  it('online renders the paper mini-page regardless of status', () => {
    expect(previewMode(vm({ kind: 'online', template_file_path: null }))).toBe('online-paper')
    expect(previewMode(vm({ kind: 'online', status: 'draft', template_file_path: null }))).toBe('online-paper')
  })
  it('doc shows the illustrative placeholder', () => {
    expect(previewMode(vm({ kind: 'doc', template_file_path: null }))).toBe('doc-placeholder')
  })
})

describe('cardCountLabel', () => {
  it('is an em dash for drafts', () => {
    expect(cardCountLabel(vm({ status: 'draft' }), t)).toBe('—')
  })
  it('uses the existing received/provided rollups for active templates', () => {
    const assignees = [a('1', 'approved'), a('2', 'submitted'), a('3', null)]
    expect(cardCountLabel(vm({ assignees }), t)).toBe('2 / 3 reçus')
    expect(cardCountLabel(vm({ kind: 'doc', assignees }), t)).toBe('1 / 3 fourni')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/card.test.ts`
Expected: FAIL — `lib/forms/card` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/forms/card.ts`:

```ts
// Pure display logic for the portrait A4 template cards. No React, no
// Supabase — same testing pattern as lib/forms/rollup.ts.
import { progressLabel, type TemplateVM } from '@/lib/forms/rollup'
import type { useTranslations } from 'next-intl'

type T = ReturnType<typeof useTranslations<never>>

export type PreviewMode = 'pdf-file' | 'pdf-missing' | 'online-paper' | 'doc-placeholder'

// Which preview the card's A4 zone shows (spec table): a real page-1
// thumbnail when the PDF exists, a dashed « PDF à joindre » when it doesn't
// yet, a CSS "paper" of the real field labels for online forms, and an
// illustrative placeholder for docs (students upload those — there is no
// organizer document to preview).
export function previewMode(t: Pick<TemplateVM, 'kind' | 'template_file_path'>): PreviewMode {
  if (t.kind === 'online') return 'online-paper'
  if (t.kind === 'doc') return 'doc-placeholder'
  return t.template_file_path ? 'pdf-file' : 'pdf-missing'
}

// « x / y reçus » / « x / y fourni » for active templates, an em dash for drafts.
export function cardCountLabel(tpl: TemplateVM, t: T): string {
  if (tpl.status === 'draft') return '—'
  return progressLabel(tpl, t)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/card.ts lib/forms/__tests__/card.test.ts
git commit -m "feat(forms): pure card display logic (preview mode + count label)"
```

---

### Task 5: Thumbnail cache (`lib/forms/thumbnail-cache.ts`)

**Files:**
- Create: `lib/forms/thumbnail-cache.ts`
- Test: `lib/forms/__tests__/thumbnail-cache.test.ts`

**Interfaces:**
- Produces: `getCachedThumbnail(path: string): string | null`, `putCachedThumbnail(path: string, dataUrl: string): void`, `clearThumbnailMemoryCache(): void` (test helper). Task 6's `TemplateThumbnail` consumes the first two.

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/thumbnail-cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getCachedThumbnail, putCachedThumbnail, clearThumbnailMemoryCache,
} from '@/lib/forms/thumbnail-cache'

beforeEach(() => {
  localStorage.clear()
  clearThumbnailMemoryCache()
  vi.restoreAllMocks()
})

describe('thumbnail cache', () => {
  it('round-trips through localStorage keyed by file path', () => {
    putCachedThumbnail('s1/t1.pdf', 'data:image/png;base64,AAA')
    clearThumbnailMemoryCache() // force the localStorage layer
    expect(getCachedThumbnail('s1/t1.pdf')).toBe('data:image/png;base64,AAA')
    expect(getCachedThumbnail('s1/other.pdf')).toBeNull()
  })

  it('a replaced file path is a different key (automatic invalidation)', () => {
    putCachedThumbnail('s1/t1.pdf', 'data:old')
    expect(getCachedThumbnail('s1/t1-v2.pdf')).toBeNull()
  })

  it('caps entries at 20, evicting the oldest', () => {
    for (let i = 0; i < 25; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + i)
      putCachedThumbnail(`s1/t${i}.pdf`, `data:${i}`)
    }
    clearThumbnailMemoryCache()
    expect(getCachedThumbnail('s1/t0.pdf')).toBeNull()   // evicted
    expect(getCachedThumbnail('s1/t4.pdf')).toBeNull()   // evicted
    expect(getCachedThumbnail('s1/t5.pdf')).toBe('data:5')
    expect(getCachedThumbnail('s1/t24.pdf')).toBe('data:24')
  })

  it('survives a quota error: memory layer still serves the value', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    putCachedThumbnail('s1/t1.pdf', 'data:big')
    expect(getCachedThumbnail('s1/t1.pdf')).toBe('data:big')
  })

  it('treats corrupt stored JSON as a miss', () => {
    localStorage.setItem('eazy.tplthumb.s1/t1.pdf', '{not json')
    expect(getCachedThumbnail('s1/t1.pdf')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/thumbnail-cache.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/forms/thumbnail-cache.ts`:

```ts
// Client-side cache for rendered PDF page-1 thumbnails. Keyed by
// template_file_path — replacing a file changes the path, so invalidation is
// automatic. Two layers: an in-memory Map for the session and localStorage
// PNG data-URLs capped at MAX_ENTRIES (oldest evicted). Every storage error
// (quota, disabled storage, corrupt JSON) degrades to a cache miss — a cache
// problem must never surface to the card.
const PREFIX = 'eazy.tplthumb.'
const MAX_ENTRIES = 20

type Entry = { d: string; at: number }

const memory = new Map<string, string>()

export function getCachedThumbnail(path: string): string | null {
  const hit = memory.get(path)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(PREFIX + path)
    if (!raw) return null
    const entry = JSON.parse(raw) as Entry
    if (typeof entry?.d !== 'string') return null
    memory.set(path, entry.d)
    return entry.d
  } catch {
    return null
  }
}

export function putCachedThumbnail(path: string, dataUrl: string): void {
  memory.set(path, dataUrl)
  const value = JSON.stringify({ d: dataUrl, at: Date.now() } satisfies Entry)
  try {
    localStorage.setItem(PREFIX + path, value)
    evictDownTo(MAX_ENTRIES)
  } catch {
    // Quota: make room once and retry; after that the memory layer suffices.
    try {
      evictDownTo(Math.floor(MAX_ENTRIES / 2))
      localStorage.setItem(PREFIX + path, value)
    } catch { /* memory layer still has it */ }
  }
}

function evictDownTo(keep: number): void {
  const entries: { key: string; at: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue
    let at = 0
    try { at = (JSON.parse(localStorage.getItem(key) ?? '') as Entry).at ?? 0 } catch { /* oldest */ }
    entries.push({ key, at })
  }
  if (entries.length <= keep) return
  entries.sort((x, y) => x.at - y.at)
  for (const e of entries.slice(0, entries.length - keep)) localStorage.removeItem(e.key)
}

// Test helper — the module-level Map otherwise leaks state between tests.
export function clearThumbnailMemoryCache(): void {
  memory.clear()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/thumbnail-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/thumbnail-cache.ts lib/forms/__tests__/thumbnail-cache.test.ts
git commit -m "feat(forms): localStorage+memory thumbnail cache keyed by file path"
```

---

### Task 6: `TemplateThumbnail` client component (pdfjs-dist)

**Files:**
- Create: `components/forms/TemplateThumbnail.tsx`
- Modify: `vitest.setup.ts`, `package.json` (`pnpm add pdfjs-dist`)
- Test: `components/forms/__tests__/TemplateThumbnail.test.tsx`

**Interfaces:**
- Consumes: `getTemplateFileUrl(id)` (existing signed-URL action in `actions/forms.ts`), Task 5's cache.
- Produces: `<TemplateThumbnail templateId filePath alt fallback />` — renders a shimmer, then the page-1 image; renders `fallback` (a ReactNode) on ANY failure, silently. Task 7's `TemplateCard` consumes it.

- [ ] **Step 1: Install the dependency**

```bash
pnpm add pdfjs-dist
```

- [ ] **Step 2: Stub IntersectionObserver for jsdom**

Replace the content of `vitest.setup.ts` with:

```ts
import '@testing-library/jest-dom'

// jsdom has no IntersectionObserver; TemplateThumbnail lazy-loads on it. The
// default stub never intersects — tests that need intersection install their
// own triggering stub.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver
}
```

- [ ] **Step 3: Write the failing test**

Create `components/forms/__tests__/TemplateThumbnail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { putCachedThumbnail, clearThumbnailMemoryCache } from '@/lib/forms/thumbnail-cache'

const getUrl = vi.fn()
vi.mock('@/actions/forms', () => ({
  getTemplateFileUrl: (...a: unknown[]) => getUrl(...a),
}))

// pdfjs-dist is dynamically imported by the component; vi.mock intercepts it.
// workerPort pre-set → the component's Worker bootstrap branch is skipped
// (jsdom has no Worker).
const renderPage = vi.fn(() => ({ promise: Promise.resolve() }))
const page = { getViewport: vi.fn(() => ({ width: 210, height: 297 })), render: renderPage }
const doc = { getPage: vi.fn(async () => page), destroy: vi.fn() }
const getDocument = vi.fn(() => ({ promise: Promise.resolve(doc) }))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerPort: {}, workerSrc: 'stub' },
  getDocument: (...a: unknown[]) => getDocument(...a),
}))

import { TemplateThumbnail } from '@/components/forms/TemplateThumbnail'

// Immediately-intersecting stub: the card is "in view" as soon as observed.
class ImmediateIO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() {
    this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

beforeEach(() => {
  localStorage.clear()
  clearThumbnailMemoryCache()
  vi.clearAllMocks()
  globalThis.IntersectionObserver = ImmediateIO as unknown as typeof IntersectionObserver
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,RENDERED')
})

const props = { templateId: 't1', filePath: 's1/t1.pdf', alt: 'Autorisation', fallback: <div data-testid="generic-paper" /> }

describe('TemplateThumbnail', () => {
  it('renders the page-1 image after signed URL + pdf.js pipeline, and caches it', async () => {
    getUrl.mockResolvedValue('https://signed.example/t1.pdf')
    render(<TemplateThumbnail {...props} />)
    const img = await screen.findByRole('img', { name: 'Autorisation' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,RENDERED')
    expect(getDocument).toHaveBeenCalledWith({ url: 'https://signed.example/t1.pdf' })
    expect(localStorage.getItem('eazy.tplthumb.s1/t1.pdf')).toContain('RENDERED')
  })

  it('serves from cache without calling the signed-URL action', async () => {
    putCachedThumbnail('s1/t1.pdf', 'data:image/png;base64,CACHED')
    render(<TemplateThumbnail {...props} />)
    const img = await screen.findByRole('img', { name: 'Autorisation' })
    expect(img).toHaveAttribute('src', 'data:image/png;base64,CACHED')
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('falls back silently when the signed URL fails', async () => {
    getUrl.mockRejectedValue(new Error('boom'))
    render(<TemplateThumbnail {...props} />)
    await screen.findByTestId('generic-paper')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('falls back silently when pdf.js fails', async () => {
    getUrl.mockResolvedValue('https://signed.example/t1.pdf')
    getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error('corrupt pdf')) })
    render(<TemplateThumbnail {...props} />)
    await screen.findByTestId('generic-paper')
  })

  it('shows the shimmer until intersection (noop observer ⇒ stays shimmering)', () => {
    globalThis.IntersectionObserver = class {
      observe() {} unobserve() {} disconnect() {} takeRecords() { return [] }
    } as unknown as typeof IntersectionObserver
    render(<TemplateThumbnail {...props} />)
    expect(screen.getByTestId('thumb-shimmer')).toBeInTheDocument()
    expect(getUrl).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/TemplateThumbnail.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 5: Write the component**

Create `components/forms/TemplateThumbnail.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { getTemplateFileUrl } from '@/actions/forms'
import { getCachedThumbnail, putCachedThumbnail } from '@/lib/forms/thumbnail-cache'

// Page 1 of the template PDF as a lazy client-rendered image. Work is
// deferred until the card nears the viewport (IntersectionObserver), then:
// signed URL → dynamic import('pdfjs-dist') → canvas → data URL (cached by
// file path). pdfjs-dist must never enter the main bundle. On ANY failure
// (signed URL, corrupt PDF, pdf.js) render the `fallback` silently — a broken
// thumbnail must never break the card or raise a toast.
export function TemplateThumbnail({
  templateId, filePath, alt, fallback,
}: {
  templateId: string
  filePath: string
  alt: string
  fallback: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(() => getCachedThumbnail(filePath))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (src || failed) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let cancelled = false
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      observer.disconnect()
      void (async () => {
        try {
          const cached = getCachedThumbnail(filePath)
          const dataUrl = cached ?? await renderFirstPage(await getTemplateFileUrl(templateId))
          if (!cached) putCachedThumbnail(filePath, dataUrl)
          if (!cancelled) setSrc(dataUrl)
        } catch {
          if (!cancelled) setFailed(true)
        }
      })()
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => { cancelled = true; observer.disconnect() }
  }, [templateId, filePath, src, failed])

  if (failed) return <>{fallback}</>
  return (
    <div ref={ref} className="h-full w-full">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote asset
        <img src={src} alt={alt} className="h-full w-full object-cover object-top" />
      ) : (
        <div data-testid="thumb-shimmer" className="h-full w-full animate-pulse rounded-[2px] bg-background" />
      )}
    </div>
  )
}

// ~2× the card preview width so the thumbnail stays crisp on retina.
const TARGET_WIDTH = 460

async function renderFirstPage(url: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerPort && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    )
  }
  const doc = await pdfjs.getDocument({ url }).promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) throw new Error('no 2d context')
    await page.render({ canvasContext, viewport, canvas }).promise
    return canvas.toDataURL('image/png')
  } finally {
    void doc.destroy()
  }
}
```

Note: if `pnpm build` / `npx tsc --noEmit` complains about the `render({ canvasContext, viewport, canvas })` parameter shape for the installed pdfjs-dist major, adapt to that version's `RenderParameters` (older majors take `{ canvasContext, viewport }` only) — keep the rest identical.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run components/forms/__tests__/TemplateThumbnail.test.tsx lib/forms/__tests__/thumbnail-cache.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.setup.ts components/forms/TemplateThumbnail.tsx components/forms/__tests__/TemplateThumbnail.test.tsx
git commit -m "feat(forms): lazy client PDF thumbnail via pdfjs-dist with silent fallback"
```

---

### Task 7: `TemplateCard` + `TemplateGrid` + card i18n keys

**Files:**
- Create: `components/forms/TemplateCard.tsx`, `components/forms/TemplateGrid.tsx`
- Modify: `messages/{fr,en,es,it,de}.json` (add `organizer.templateCard`)
- Test: `components/forms/__tests__/TemplateCard.test.tsx`

**Interfaces:**
- Consumes: `previewMode`/`cardCountLabel` (Task 4), `TemplateThumbnail` (Task 6), existing `StatusPill`, `typePill`, `statusPill`, `reqPill` from `lib/forms/rollup`.
- Produces: `<TemplateCard vm={TemplateVM} onOpen={() => void} />` (whole card is one button) and `<TemplateGrid>{children}</TemplateGrid>`. Tasks 10–11 consume both.

- [ ] **Step 1: Add the i18n keys (all 5 catalogs)**

In each `messages/<locale>.json`, add a `"templateCard"` object inside `"organizer"` (alphabetical placement next to its siblings is not required; match surrounding style):

fr:
```json
"templateCard": {
  "pdfMissing": "PDF à joindre",
  "docPlaceholder": "Copie à déposer"
}
```
en:
```json
"templateCard": {
  "pdfMissing": "PDF to attach",
  "docPlaceholder": "Copy to upload"
}
```
es:
```json
"templateCard": {
  "pdfMissing": "PDF por adjuntar",
  "docPlaceholder": "Copia por subir"
}
```
it:
```json
"templateCard": {
  "pdfMissing": "PDF da allegare",
  "docPlaceholder": "Copia da caricare"
}
```
de:
```json
"templateCard": {
  "pdfMissing": "PDF anzuhängen",
  "docPlaceholder": "Kopie einzureichen"
}
```

- [ ] **Step 2: Write the failing test**

Create `components/forms/__tests__/TemplateCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('@/actions/forms', () => ({
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { TemplateCard } from '@/components/forms/TemplateCard'
import type { TemplateVM, AssigneeRow } from '@/lib/forms/rollup'

const a = (id: string, s: AssigneeRow['submissionStatus']): AssigneeRow =>
  ({ assignmentId: `as-${id}`, studentId: id, studentName: `Élève ${id}`, submissionStatus: s })

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Autorisation médicale',
  description: null, deadline: '2026-10-10T00:00:00+00:00', standard_key: 'medical',
  condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: [], assignees: [a('1', 'approved'), a('2', null)], ...over,
})

describe('TemplateCard', () => {
  it('active pdf card: name, type pill, status chip, response count, thumbnail shimmer', () => {
    renderWithIntl(<TemplateCard vm={vm({})} onOpen={() => {}} />)
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('PDF · à signer')).toBeInTheDocument()
    expect(screen.getByText('Actif')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 reçus')).toBeInTheDocument()
    expect(screen.getByTestId('thumb-shimmer')).toBeInTheDocument() // lazy: noop IO stub
  })

  it('pdf draft without file: dashed « PDF à joindre » and em-dash count', () => {
    renderWithIntl(<TemplateCard vm={vm({ status: 'draft', template_file_path: null, assignees: [] })} onOpen={() => {}} />)
    expect(screen.getByText('PDF à joindre')).toBeInTheDocument()
    expect(screen.getByText('Brouillon')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('online form: paper preview shows the real field labels', () => {
    renderWithIntl(<TemplateCard vm={vm({
      kind: 'online', template_file_path: null,
      fields: ['Groupe sanguin', 'Allergies connues', 'Médecin traitant'],
    })} onOpen={() => {}} />)
    expect(screen.getByText('Groupe sanguin')).toBeInTheDocument()
    expect(screen.getByText('Allergies connues')).toBeInTheDocument()
    expect(screen.getByText('Formulaire en ligne')).toBeInTheDocument()
  })

  it('doc: illustrative placeholder and requirement pill', () => {
    renderWithIntl(<TemplateCard vm={vm({ kind: 'doc', template_file_path: null, name: 'Passeport de l’élève' })} onOpen={() => {}} />)
    expect(screen.getByText('Copie à déposer')).toBeInTheDocument()
    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
  })

  it('clicking anywhere on the card fires onOpen (no other buttons)', () => {
    const onOpen = vi.fn()
    renderWithIntl(<TemplateCard vm={vm({})} onOpen={onOpen} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0])
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/TemplateCard.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Write the components**

Create `components/forms/TemplateGrid.tsx`:

```tsx
// Responsive grid for the portrait template cards: 4 columns wide desktop,
// 3 laptop, 2 tablet, 1 at 375px (spec).
export function TemplateGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  )
}
```

Create `components/forms/TemplateCard.tsx`:

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { typePill, statusPill, reqPill, type TemplateVM } from '@/lib/forms/rollup'
import { previewMode, cardCountLabel } from '@/lib/forms/card'
import { TemplateThumbnail } from './TemplateThumbnail'

// Portrait « A4 paper » card (approved mockup option C v2): preview zone on
// top showing the document itself, then name, type pill and response count.
// The status chip overlays the preview top-right. No buttons — clicking
// anywhere opens the existing detail drawer (Aperçu / Modifier / Supprimer /
// Télécharger live there). The layout deliberately leaves room for a future
// « convertir » action.
export function TemplateCard({ vm, onOpen }: { vm: TemplateVM; onOpen: () => void }) {
  const t = useTranslations('organizer')
  const tr = useTranslations()
  const mode = previewMode(vm)

  return (
    <button type="button" onClick={onOpen}
      className="group overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-modal">
      <div className={`relative mx-3 mt-3 aspect-[210/260] overflow-hidden rounded-[3px] p-2.5 ${
        mode === 'pdf-missing'
          ? 'border border-dashed border-frame bg-hoverrow'
          : 'border bg-card shadow-sm'
      }`}>
        {mode === 'pdf-file' && (
          <TemplateThumbnail templateId={vm.id} filePath={vm.template_file_path!}
            alt={vm.name} fallback={<GenericPaper />} />
        )}
        {mode === 'pdf-missing' && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-placeholder">
            <span aria-hidden="true" className="text-lg leading-none">⤒</span>
            <span className="text-[10px] font-medium">{t('templateCard.pdfMissing')}</span>
          </div>
        )}
        {mode === 'online-paper' && <PaperFields fields={vm.fields} />}
        {mode === 'doc-placeholder' && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5">
            <div className="flex h-[60px] w-[46px] flex-none flex-col items-center justify-center gap-1 rounded bg-rail">
              <div className="h-4 w-4 rounded-full border-2 border-white/60" />
              <div className="h-[3px] w-6 rounded-sm bg-white/60" />
            </div>
            <span className="text-[10px] font-medium text-placeholder">{t('templateCard.docPlaceholder')}</span>
          </div>
        )}
        <span className="absolute right-2 top-2">
          <StatusPill pill={statusPill(vm.status, tr)} />
        </span>
      </div>
      <div className="p-3">
        <div className="mb-1.5 line-clamp-2 font-display text-[13px] font-semibold leading-snug text-navy">
          {vm.name}
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusPill pill={vm.kind === 'doc' ? reqPill(vm, tr) : typePill(vm.kind, tr)} />
          <span className="font-mono text-[10.5px] font-semibold text-tertiary">{cardCountLabel(vm, tr)}</span>
        </div>
      </div>
    </button>
  )
}

// « Paper » mini-page for online forms: the template's REAL field labels as
// tiny form rows (pure CSS/JSX from the fields getTemplatesPage already
// returns). First 4 labels; skeleton lines when the draft has none yet.
function PaperFields({ fields }: { fields: string[] }) {
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div aria-hidden="true" className="mb-1 h-2 w-2/3 rounded-sm bg-frame" />
      {fields.slice(0, 4).map((label, i) => (
        <div key={i}>
          <div className="mb-0.5 truncate text-[7.5px] font-medium leading-tight text-muted-foreground">{label}</div>
          <div aria-hidden="true" className="h-2.5 rounded-[2px] border border-frame" />
        </div>
      ))}
      {fields.length === 0 && (
        <div aria-hidden="true" className="flex flex-col gap-1.5">
          <div className="h-1.5 w-4/5 rounded-sm bg-background" />
          <div className="h-1.5 w-3/5 rounded-sm bg-background" />
          <div className="h-1.5 w-4/6 rounded-sm bg-background" />
        </div>
      )}
      {fields.length > 4 && <div aria-hidden="true" className="h-1.5 w-1/3 rounded-sm bg-background" />}
    </div>
  )
}

// Stylized generic page — the silent fallback when a real thumbnail can't be
// rendered. Exported for TemplateThumbnail's fallback prop reuse in views.
export function GenericPaper() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div className="mb-1 h-2 w-1/2 rounded-sm bg-frame" />
      <div className="h-1.5 w-[90%] rounded-sm bg-background" />
      <div className="h-1.5 w-[82%] rounded-sm bg-background" />
      <div className="h-1.5 w-[88%] rounded-sm bg-background" />
      <div className="mt-1 rounded-[2px] border border-frame p-1">
        <div className="mb-1 h-1.5 w-[70%] rounded-sm bg-background" />
        <div className="h-1.5 w-[55%] rounded-sm bg-background" />
      </div>
      <div className="mt-1.5 h-1.5 w-1/3 rounded-sm bg-background" />
    </div>
  )
}
```

(If `border-frame` / `bg-frame` are not theme tokens — check `tailwind.config.ts` `colors.frame` — use the tokens that `AddFormPanel.tsx` used for its dashed border, e.g. `border-frame` exists there already; `bg-frame` mirrors it. Adjust to the actual token names, never invent new theme entries.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run components/forms/__tests__/TemplateCard.test.tsx messages/__tests__/parity.test.ts`
Expected: PASS (parity proves all 5 catalogs got the keys).

- [ ] **Step 6: Commit**

```bash
git add components/forms/TemplateCard.tsx components/forms/TemplateGrid.tsx components/forms/__tests__/TemplateCard.test.tsx messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(forms): portrait A4 TemplateCard with per-kind previews + responsive TemplateGrid"
```

---

### Task 8: Library filter logic (`lib/forms/library.ts`)

**Files:**
- Create: `lib/forms/library.ts`
- Test: `lib/forms/__tests__/library.test.ts`

**Interfaces:**
- Consumes: `STANDARD_TEMPLATES`, `StandardTemplate` from `lib/forms/standard-library.ts`.
- Produces: `type LibraryFamily = 'forms' | 'docs'`, `type LibraryEntry = StandardTemplate & { added: boolean }`, `libraryEntries(family, existingKeys, query): LibraryEntry[]`. Task 9 consumes all three.

- [ ] **Step 1: Write the failing test**

Create `lib/forms/__tests__/library.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { libraryEntries } from '@/lib/forms/library'

describe('libraryEntries', () => {
  it('forms family = online + pdf kinds; docs family = doc kind', () => {
    const forms = libraryEntries('forms', [], '')
    expect(forms.map(e => e.key)).toEqual(['medical', 'decharge', 'absence', 'famille', 'ast'])
    const docs = libraryEntries('docs', [], '')
    expect(docs.map(e => e.key)).toEqual(['passeport', 'passeport-parent', 'esta'])
  })

  it('search filters on name and description, case-insensitively', () => {
    expect(libraryEntries('forms', [], 'MÉDICALE').map(e => e.key)).toEqual(['medical'])
    // "CERFA" appears only in the AST description
    expect(libraryEntries('forms', [], 'cerfa').map(e => e.key)).toEqual(['ast'])
    expect(libraryEntries('forms', [], 'zzz')).toEqual([])
  })

  it('marks entries whose standard_key already exists on the exchange', () => {
    const entries = libraryEntries('docs', ['passeport'], '')
    expect(entries.find(e => e.key === 'passeport')?.added).toBe(true)
    expect(entries.find(e => e.key === 'esta')?.added).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/forms/__tests__/library.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/forms/library.ts`:

```ts
// Pure filtering for the standard-template library drawer. Source of truth
// stays STANDARD_TEMPLATES; the drawer shows the page's family only and greys
// entries the exchange already has.
import { STANDARD_TEMPLATES, type StandardTemplate } from '@/lib/forms/standard-library'

export type LibraryFamily = 'forms' | 'docs'
export type LibraryEntry = StandardTemplate & { added: boolean }

export function libraryEntries(
  family: LibraryFamily,
  existingKeys: readonly string[],
  query: string,
): LibraryEntry[] {
  const kinds: StandardTemplate['kind'][] = family === 'forms' ? ['online', 'pdf'] : ['doc']
  const q = query.trim().toLowerCase()
  return STANDARD_TEMPLATES
    .filter((std) => kinds.includes(std.kind))
    .filter((std) => q === '' || std.name.toLowerCase().includes(q) || std.description.toLowerCase().includes(q))
    .map((std) => ({ ...std, added: existingKeys.includes(std.key) }))
}
```

Note: the `'MÉDICALE'` test passes because `'médicale'.toLowerCase()` is identity and the name contains `médicale`; no accent-folding is required (YAGNI — the library has 8 entries).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/forms/__tests__/library.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/library.ts lib/forms/__tests__/library.test.ts
git commit -m "feat(forms): pure library filtering (family, search, already-added)"
```

---

### Task 9: `LibraryDrawer` component + library i18n keys

**Files:**
- Create: `components/forms/LibraryDrawer.tsx`
- Modify: `messages/{fr,en,es,it,de}.json` (add `organizer.library`)
- Test: `components/forms/__tests__/LibraryDrawer.test.tsx`

**Interfaces:**
- Consumes: `libraryEntries`/`LibraryFamily` (Task 8), `addStandardTemplate` (Task 1), existing `createDraftTemplate`; keeps the 460px drawer pattern from `FormDrawer` (backdrop, Escape-to-close, `animate-[drwIn_.25s_ease-out]`).
- Produces: `<LibraryDrawer family exchangeId existingKeys onClose onAdded />` where `onAdded(id: string)` fires after a standard add OR a custom create — the views use it to close the drawer and open the new template's detail drawer. Tasks 10–11 consume it. Reused existing keys: `organizer.forms.addFormLabel` / `organizer.documents.addDocLabel` (drawer title), `organizer.forms.close` (✕ aria), `common.actions.add` (« Ajouter »), `common.errors.generic`, `organizer.forms.addPanel.*` and `organizer.documents.addPanel.*` (create-form fields).

- [ ] **Step 1: Add the i18n keys (all 5 catalogs)**

Add a `"library"` object inside `"organizer"` in each catalog:

fr:
```json
"library": {
  "heading": "Bibliothèque",
  "searchPlaceholder": "Rechercher…",
  "alreadyAdded": "Déjà ajouté ✓",
  "adding": "Ajout…",
  "customHeading": "Ou",
  "uploadPdfTile": "Téléverser un PDF",
  "createOnlineTile": "Créer un formulaire en ligne",
  "requestDocTile": "Demander un document"
}
```
en:
```json
"library": {
  "heading": "Library",
  "searchPlaceholder": "Search…",
  "alreadyAdded": "Already added ✓",
  "adding": "Adding…",
  "customHeading": "Or",
  "uploadPdfTile": "Upload a PDF",
  "createOnlineTile": "Create an online form",
  "requestDocTile": "Request a document"
}
```
es:
```json
"library": {
  "heading": "Biblioteca",
  "searchPlaceholder": "Buscar…",
  "alreadyAdded": "Ya añadido ✓",
  "adding": "Añadiendo…",
  "customHeading": "O",
  "uploadPdfTile": "Subir un PDF",
  "createOnlineTile": "Crear un formulario en línea",
  "requestDocTile": "Solicitar un documento"
}
```
it:
```json
"library": {
  "heading": "Biblioteca",
  "searchPlaceholder": "Cerca…",
  "alreadyAdded": "Già aggiunto ✓",
  "adding": "Aggiunta…",
  "customHeading": "Oppure",
  "uploadPdfTile": "Carica un PDF",
  "createOnlineTile": "Crea un modulo online",
  "requestDocTile": "Richiedi un documento"
}
```
de:
```json
"library": {
  "heading": "Bibliothek",
  "searchPlaceholder": "Suchen…",
  "alreadyAdded": "Bereits hinzugefügt ✓",
  "adding": "Wird hinzugefügt…",
  "customHeading": "Oder",
  "uploadPdfTile": "PDF hochladen",
  "createOnlineTile": "Online-Formular erstellen",
  "requestDocTile": "Unterlage anfordern"
}
```

- [ ] **Step 2: Write the failing test**

Create `components/forms/__tests__/LibraryDrawer.test.tsx`:

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
  it('forms family lists only online+pdf entries with the custom tiles', () => {
    renderWithIntl(<LibraryDrawer {...base} family="forms" />)
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.getByText('AST — autorisation de sortie du territoire (CERFA 15646)')).toBeInTheDocument()
    expect(screen.queryByText('Passeport de l’élève')).toBeNull()
    expect(screen.getByRole('button', { name: 'Téléverser un PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un formulaire en ligne' })).toBeInTheDocument()
  })

  it('docs family lists only doc entries with the request tile', () => {
    renderWithIntl(<LibraryDrawer {...base} family="docs" />)
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('search filters entries client-side', () => {
    renderWithIntl(<LibraryDrawer {...base} family="forms" />)
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'absence' } })
    expect(screen.getByText('Demande d’absence')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
  })

  it('greys already-added entries (no Ajouter button)', () => {
    renderWithIntl(<LibraryDrawer {...base} family="docs" existingKeys={['passeport']} />)
    const entry = screen.getByTestId('lib-entry-passeport')
    expect(within(entry).getByText('Déjà ajouté ✓')).toBeInTheDocument()
    expect(within(entry).queryByRole('button', { name: 'Ajouter' })).toBeNull()
    expect(within(screen.getByTestId('lib-entry-esta')).getByRole('button', { name: 'Ajouter' })).toBeInTheDocument()
  })

  it('Ajouter calls addStandardTemplate and fires onAdded with the new id', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} family="forms" onAdded={onAdded} />)
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('std-1'))
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('shows a structured add failure inline', async () => {
    addStandard.mockResolvedValue({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    renderWithIntl(<LibraryDrawer {...base} family="forms" />)
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByText('Ce modèle est déjà ajouté à cet échange.')).toBeInTheDocument()
  })

  it('custom online tile flips to the create form and creates a draft', async () => {
    const onAdded = vi.fn()
    renderWithIntl(<LibraryDrawer {...base} family="forms" onAdded={onAdded} />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer un formulaire en ligne' }))
    fireEvent.change(screen.getByLabelText('Nom du formulaire'), { target: { value: 'Mon form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('new-1'))
    const fd = createDraft.mock.calls[0][0] as FormData
    expect(fd.get('kind')).toBe('online')
    expect(fd.get('name')).toBe('Mon form')
    expect(fd.get('exchange_id')).toBe('ex1')
  })

  it('docs create form carries audience and condition', async () => {
    renderWithIntl(<LibraryDrawer {...base} family="docs" />)
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
    renderWithIntl(<LibraryDrawer {...base} family="forms" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/LibraryDrawer.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 4: Write the component**

Create `components/forms/LibraryDrawer.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { libraryEntries, type LibraryFamily } from '@/lib/forms/library'
import { addStandardTemplate, createDraftTemplate } from '@/actions/forms'

type CreateMode = 'pdf' | 'online' | 'doc'

// Right library drawer (460px, same pattern as FormDrawer): search over the
// standard library filtered to the page's family, an « Ajouter » per entry
// (greyed when the exchange already has that standard_key), then the custom
// tiles which flip the drawer to the short create form — same fields and
// createDraftTemplate action the old add panels used. Adding or creating
// hands the new template id to onAdded (the views close the drawer and open
// the detail drawer, the same continuation as the old onCreated).
export function LibraryDrawer({
  family, exchangeId, existingKeys, onClose, onAdded,
}: {
  family: LibraryFamily
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

  const entries = libraryEntries(family, existingKeys, query)

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
            {family === 'forms' ? t('forms.addFormLabel') : t('documents.addDocLabel')}
          </div>
          <button type="button" onClick={onClose} aria-label={t('forms.close')}
            className="h-8 w-8 rounded-lg border bg-card text-base text-muted-foreground">✕</button>
        </div>

        {createMode === null ? (
          <div className="flex-1 overflow-auto px-[26px] py-[22px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library.searchPlaceholder')}
              className="mb-5 h-11 w-full rounded-[10px] border border-frame bg-card px-3 text-[14px] placeholder:text-placeholder focus:border-brand focus:outline-none" />

            <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
              {t('library.heading')}
            </div>
            <div className="flex flex-col gap-2.5">
              {entries.map((entry) => (
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
            {error && <p className="mt-3 text-sm text-danger-text">{error}</p>}

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-background" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-placeholder">{t('library.customHeading')}</span>
              <div className="h-px flex-1 bg-background" />
            </div>
            {family === 'forms' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setCreateMode('pdf')}
                  className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                  ⤒ {t('library.uploadPdfTile')}
                </button>
                <button type="button" onClick={() => setCreateMode('online')}
                  className="rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                  ✎ {t('library.createOnlineTile')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCreateMode('doc')}
                className="w-full rounded-xl border bg-card p-3.5 text-left text-[13px] font-semibold text-navy hover:border-brand">
                + {t('library.requestDocTile')}
              </button>
            )}
          </div>
        ) : (
          <CreateTemplateForm mode={createMode} exchangeId={exchangeId}
            onBack={() => setCreateMode(null)} onCreated={onAdded} />
        )}
      </div>
    </div>
  )
}

// The short create form the old AddFormPanel / AddDocPanel provided: name,
// échéance optionnelle, PDF file when relevant, audience+condition for docs.
function CreateTemplateForm({
  mode, exchangeId, onBack, onCreated,
}: {
  mode: CreateMode
  exchangeId: string
  onBack: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [audience, setAudience] = useState<'all' | 'conditional'>('all')
  const [condition, setCondition] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  const ns = mode === 'doc' ? 'documents' : 'forms'

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', mode)
      fd.set('name', name)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'pdf' && file) fd.set('file', file)
      if (mode === 'doc') {
        fd.set('audience', audience)
        if (audience === 'conditional' && condition) fd.set('condition_label', condition)
      }
      const res = await createDraftTemplate(fd)
      if (!res.ok) {
        setError(res.message)
        setBusy(false)
        return
      }
      onCreated(res.id)
    } catch {
      setError(c('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-1 flex-col gap-3 overflow-auto px-[26px] py-[22px]">
      <div className="flex flex-col gap-1">
        <label htmlFor="lib-create-name" className="text-[13px] font-semibold text-navy">
          {t(`${ns}.addPanel.nameLabel`)}
        </label>
        <input id="lib-create-name" value={name} onChange={(e) => setName(e.target.value)} required
          placeholder={mode === 'doc' ? t('documents.addPanel.namePlaceholder')
            : mode === 'pdf' ? t('forms.addPanel.namePlaceholderPdf') : t('forms.addPanel.namePlaceholderOnline')}
          className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lib-create-deadline" className="text-[13px] font-semibold text-navy">
          {t(`${ns}.addPanel.deadlineLabel`)}
        </label>
        <input id="lib-create-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
          className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
      </div>
      {mode === 'pdf' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="lib-create-file" className="text-[13px] font-semibold text-navy">{t('forms.addPanel.fileLabel')}</label>
          <input id="lib-create-file" type="file" accept="application/pdf" required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] text-muted-foreground" />
        </div>
      )}
      {mode === 'doc' && (
        <fieldset className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
            <input type="radio" name="lib-audience" checked={audience === 'all'} onChange={() => setAudience('all')} />
            {t('documents.addPanel.mandatoryTile.title')}
          </label>
          <label className="flex items-center gap-2 text-[13px] font-medium text-navy">
            <input type="radio" name="lib-audience" checked={audience === 'conditional'} onChange={() => setAudience('conditional')} />
            {t('documents.addPanel.conditionalTile.title')}
          </label>
        </fieldset>
      )}
      {mode === 'doc' && audience === 'conditional' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="lib-create-cond" className="text-[13px] font-semibold text-navy">{t('documents.addPanel.conditionLabel')}</label>
          <input id="lib-create-cond" value={condition} onChange={(e) => setCondition(e.target.value)}
            placeholder={t('documents.addPanel.conditionPlaceholder')}
            className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
        </div>
      )}
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <div className="mt-auto flex gap-2.5 pt-3">
        <button type="submit" disabled={busy}
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
          {busy ? t(`${ns}.addPanel.creating`) : t(`${ns}.addPanel.createDraft`)}
        </button>
        <button type="button" onClick={onBack}
          className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">
          {t(`${ns}.addPanel.back`)}
        </button>
      </div>
    </form>
  )
}
```

(Template-literal keys like `` t(`${ns}.addPanel.nameLabel`) `` defeat next-intl's typed-key checking — if `npx tsc --noEmit` rejects them, replace with explicit conditionals: `mode === 'doc' ? t('documents.addPanel.nameLabel') : t('forms.addPanel.nameLabel')` etc.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run components/forms/__tests__/LibraryDrawer.test.tsx messages/__tests__/parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/forms/LibraryDrawer.tsx components/forms/__tests__/LibraryDrawer.test.tsx messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(forms): searchable standard-library drawer with custom-create flip"
```

---

### Task 10: Rewrite `FormsView` around the grid

**Files:**
- Rewrite: `components/forms/FormsView.tsx`
- Modify: `app/(organizer)/forms/page.tsx`
- Rewrite: `components/forms/__tests__/FormsView.test.tsx`

**Interfaces:**
- Consumes: `TemplateGrid`, `TemplateCard` (Task 7), `LibraryDrawer` (Task 9), existing `FormDrawer`.
- Produces: `FormsView({ exchangeId, templates })` — `studentCount` prop is GONE (only the deleted StatsCard used it).

- [ ] **Step 1: Rewrite the test file**

Replace `components/forms/__tests__/FormsView.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { FormsView } from '@/components/forms/FormsView'
import type { TemplateVM } from '@/lib/forms/rollup'

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Formulaire de santé',
  description: 'Antécédents médicaux.', deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'sante', condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: ['Groupe sanguin'], assignees: [
    { assignmentId: 'a1', studentId: 's1', studentName: 'Léa M', submissionStatus: 'approved' },
    { assignmentId: 'a2', studentId: 's2', studentName: 'Hugo P', submissionStatus: null },
  ],
  ...over,
})

describe('FormsView', () => {
  it('renders title, count label and a card per template — no stats strip, no banner', () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[vm({})]} />)
    expect(screen.getByRole('heading', { name: 'Formulaires' })).toBeInTheDocument()
    expect(screen.getByText('Vos formulaires · 1')).toBeInTheDocument()
    expect(screen.getByText('Formulaire de santé')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 reçus')).toBeInTheDocument()
    expect(screen.queryByText('Réponses reçues')).toBeNull()
    expect(screen.queryByText(/envoyés automatiquement/)).toBeNull()
  })

  it('clicking a card opens the detail drawer', () => {
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    expect(screen.getByText('Questions du formulaire')).toBeInTheDocument()
  })

  it('drawer activation still works from a card', async () => {
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d1', undefined)
  })

  it('« + Ajouter » opens the library drawer scoped to forms', () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(screen.getByText('Bibliothèque')).toBeInTheDocument()
    expect(screen.getByText('Autorisation médicale')).toBeInTheDocument()
    expect(screen.queryByText('Passeport de l’élève')).toBeNull()
  })

  it('existing standard keys are passed to the drawer as already added', () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[vm({ standard_key: 'medical', name: 'Autorisation médicale (la nôtre)' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(within(screen.getByTestId('lib-entry-medical')).getByText('Déjà ajouté ✓')).toBeInTheDocument()
  })

  it('adding from the library closes it and requests the new detail drawer', async () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-medical')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(screen.queryByText('Bibliothèque')).toBeNull())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'medical')
  })

  it('creating a custom online draft through the drawer calls createDraftTemplate', async () => {
    renderWithIntl(<FormsView exchangeId="ex1" templates={[]} />)
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
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', name: 'Brouillon X', fields: ['Q1'], assignees: [], template_file_path: null, deadline: null })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /Brouillon X/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })

  it('drawer lists readiness hints for an unready draft', () => {
    const draft = vm({ id: 'd9', status: 'draft', kind: 'pdf', name: 'PDF nu', deadline: null, template_file_path: null, assignees: [] })
    renderWithIntl(<FormsView exchangeId="ex1" templates={[draft]} />)
    fireEvent.click(screen.getByRole('button', { name: /PDF nu/ }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByText(/Téléversez le PDF avant d’activer\./)).toBeInTheDocument()
    const editLinks = screen.getAllByRole('link', { name: 'Modifier le modèle' })
    for (const l of editLinks) expect(l).toHaveAttribute('href', '/forms/d9')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/forms/__tests__/FormsView.test.tsx`
Expected: FAIL (old FormsView still renders StatsCard/banner/rows and requires `studentCount`).

- [ ] **Step 3: Rewrite the view**

Replace `components/forms/FormsView.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { type TemplateVM } from '@/lib/forms/rollup'
import { TemplateGrid } from './TemplateGrid'
import { TemplateCard } from './TemplateCard'
import { LibraryDrawer } from './LibraryDrawer'
import { FormDrawer } from './FormDrawer'

export function FormsView({
  exchangeId, templates,
}: {
  exchangeId: string
  templates: TemplateVM[]
}) {
  const [showLibrary, setShowLibrary] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const t = useTranslations('organizer')
  const c = useTranslations('common')

  const open = openId ? templates.find(tpl => tpl.id === openId) ?? null : null
  const existingKeys = templates
    .map(tpl => tpl.standard_key)
    .filter((k): k is string => k !== null)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{t('forms.title')}</h1>
      </div>

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('forms.yourFormsCount', { count: templates.length })}
        </div>
        <button type="button" onClick={() => setShowLibrary(true)}
          className="inline-flex items-center gap-[7px] rounded-[9px] bg-brand px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-brand-hover">
          <span className="text-[15px] leading-none">+</span> {c('actions.add')}
        </button>
      </div>

      <TemplateGrid>
        {templates.map(tpl => (
          <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
        ))}
      </TemplateGrid>

      {showLibrary && (
        <LibraryDrawer family="forms" exchangeId={exchangeId} existingKeys={existingKeys}
          onClose={() => setShowLibrary(false)}
          onAdded={(id) => { setShowLibrary(false); setOpenId(id) }} />
      )}
      <FormDrawer vm={open} onClose={() => setOpenId(null)} />
    </div>
  )
}
```

Update `app/(organizer)/forms/page.tsx` — the render becomes:

```tsx
  const { templates } = await getTemplatesPage(active.id, 'forms')
  return <FormsView exchangeId={active.id} templates={templates} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run components/forms/__tests__/FormsView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/forms/FormsView.tsx components/forms/__tests__/FormsView.test.tsx "app/(organizer)/forms/page.tsx"
git commit -m "feat(forms): FormsView rebuilt as A4 card grid with library drawer"
```

---

### Task 11: Rewrite `DocsView` around the grid

**Files:**
- Rewrite: `components/documents/DocsView.tsx`
- Modify: `app/(organizer)/documents/page.tsx`
- Rewrite: `components/documents/__tests__/DocsView.test.tsx`

**Interfaces:**
- Consumes: same components as Task 10; existing `DocDrawer` (keeps `exchangeId` + `enrolledStudents` props).
- Produces: `DocsView({ exchangeId, templates, enrolledStudents })` — `studentCount` prop is GONE.

- [ ] **Step 1: Rewrite the test file**

Replace `components/documents/__tests__/DocsView.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const addStandard = vi.fn().mockResolvedValue({ ok: true, id: 'std-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue({ ok: true, id: 'new-id' }),
  addStandardTemplate: (...a: unknown[]) => addStandard(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
import { DocsView } from '@/components/documents/DocsView'
import type { TemplateVM } from '@/lib/forms/rollup'

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

describe('DocsView', () => {
  it('renders title, count label and doc cards with placeholder + count — no stats strip', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({})]} enrolledStudents={students} />)
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByText('Pièces demandées · 1')).toBeInTheDocument()
    expect(screen.getByText('Copie à déposer')).toBeInTheDocument()
    expect(screen.getByText('Obligatoire')).toBeInTheDocument()
    expect(screen.getByText('1 / 3 fourni')).toBeInTheDocument()
    expect(screen.queryByText('Pièces reçues')).toBeNull()
  })

  it('clicking a card opens the detail drawer with per-student rows', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({})]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    expect(screen.getByText('Suivi par élève')).toBeInTheDocument()
    expect(screen.getByText('Yanis Benali')).toBeInTheDocument()
    const reviewLink = screen.getByRole('link', { name: /À vérifier/ })
    expect(reviewLink).toHaveAttribute('href', '/exchanges/ex1/submissions/a2')
  })

  it('relance still reports the result line from the drawer', async () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({})]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Relancer les familles' }))
    expect(await screen.findByText(/2 relancés/)).toBeInTheDocument()
    expect(remind).toHaveBeenCalledWith('d1')
  })

  it('conditional draft activation with student picking still works from a card', async () => {
    const draft = doc({ id: 'd2', status: 'draft', audience: 'conditional', condition_label: 'si parents divorcés', assignees: [], deadline: '2026-10-10T00:00:00+00:00' })
    renderWithIntl(<DocsView exchangeId="ex1" templates={[draft]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choisir les élèves & activer' }))
    fireEvent.click(screen.getByLabelText('Léa Moreau'))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    await screen.findByRole('button', { name: 'Activer' })
    expect(activate).toHaveBeenCalledWith('d2', ['s1'])
  })

  it('« + Ajouter » opens the library scoped to documents', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    expect(screen.getByText('Passeport de l’élève')).toBeInTheDocument()
    expect(screen.queryByText('Autorisation médicale')).toBeNull()
    expect(screen.getByRole('button', { name: 'Demander un document' })).toBeInTheDocument()
  })

  it('adding a standard doc closes the library', async () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }))
    fireEvent.click(within(screen.getByTestId('lib-entry-esta')).getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(screen.queryByText('Bibliothèque')).toBeNull())
    expect(addStandard).toHaveBeenCalledWith('ex1', 'esta')
  })

  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = doc({ id: 'd2', status: 'draft', assignees: [], deadline: null })
    renderWithIntl(<DocsView exchangeId="ex1" templates={[draft]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })

  it('drawer shows the external link when present', () => {
    renderWithIntl(<DocsView exchangeId="ex1" templates={[doc({ external_url: 'https://esta.cbp.dhs.gov' })]} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: /Passeport/ }))
    const link = screen.getByRole('link', { name: /esta\.cbp\.dhs\.gov/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
```

Note: `Pièces demandées · 1` is the exact fr rendering of `organizer.documents.requestedHeading` (`Pièces demandées · {count}`), verified against `messages/fr.json`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/documents/__tests__/DocsView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite the view**

Replace `components/documents/DocsView.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { type TemplateVM } from '@/lib/forms/rollup'
import { TemplateGrid } from '@/components/forms/TemplateGrid'
import { TemplateCard } from '@/components/forms/TemplateCard'
import { LibraryDrawer } from '@/components/forms/LibraryDrawer'
import { DocDrawer } from './DocDrawer'

export function DocsView({
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

  const open = openId ? templates.find(tpl => tpl.id === openId) ?? null : null
  const existingKeys = templates
    .map(tpl => tpl.standard_key)
    .filter((k): k is string => k !== null)

  return (
    <div className="max-w-[1040px]">
      <div className="mb-[22px]">
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-.02em]">{t('documents.title')}</h1>
      </div>

      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
          {t('documents.requestedHeading', { count: templates.length })}
        </div>
        <button type="button" onClick={() => setShowLibrary(true)}
          className="inline-flex items-center gap-[7px] rounded-[9px] bg-brand px-[15px] py-[9px] text-[13px] font-semibold text-white hover:bg-brand-hover">
          <span className="text-[15px] leading-none">+</span> {c('actions.add')}
        </button>
      </div>

      <TemplateGrid>
        {templates.map(tpl => (
          <TemplateCard key={tpl.id} vm={tpl} onOpen={() => setOpenId(tpl.id)} />
        ))}
      </TemplateGrid>

      {showLibrary && (
        <LibraryDrawer family="docs" exchangeId={exchangeId} existingKeys={existingKeys}
          onClose={() => setShowLibrary(false)}
          onAdded={(id) => { setShowLibrary(false); setOpenId(id) }} />
      )}
      <DocDrawer vm={open} exchangeId={exchangeId} enrolledStudents={enrolledStudents} onClose={() => setOpenId(null)} />
    </div>
  )
}
```

Update `app/(organizer)/documents/page.tsx` — the render becomes:

```tsx
  const { templates, enrolledStudents } = await getTemplatesPage(active.id, 'docs')
  return (
    <DocsView exchangeId={active.id} templates={templates} enrolledStudents={enrolledStudents} />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run components/documents/__tests__/DocsView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/documents/DocsView.tsx components/documents/__tests__/DocsView.test.tsx "app/(organizer)/documents/page.tsx"
git commit -m "feat(documents): DocsView rebuilt as A4 card grid with library drawer"
```

---

### Task 12: Delete dead components, prune dead code and i18n keys, full gate

**Files:**
- Delete: `components/forms/StatsCard.tsx`, `components/forms/PageBanner.tsx`, `components/forms/AddFormPanel.tsx`, `components/documents/AddDocPanel.tsx`, `components/forms/DeleteTemplateButton.tsx`, `components/forms/__tests__/DeleteTemplateButton.test.tsx`
- Modify: `lib/forms/rollup.ts`, `lib/forms/__tests__/rollup.test.ts`, `messages/{fr,en,es,it,de}.json`

- [ ] **Step 1: Verify nothing consumes the dead components, then delete them**

Run for each of `StatsCard`, `PageBanner`, `AddFormPanel`, `AddDocPanel`, `DeleteTemplateButton`:
`grep -rn "<name>" --include="*.tsx" --include="*.ts" . | grep -v node_modules | grep -v .next`
Expected: only the component's own file (and its test, for DeleteTemplateButton). Then:

```bash
git rm components/forms/StatsCard.tsx components/forms/PageBanner.tsx components/forms/AddFormPanel.tsx components/documents/AddDocPanel.tsx components/forms/DeleteTemplateButton.tsx components/forms/__tests__/DeleteTemplateButton.test.tsx
```

If any grep finds another consumer, STOP and report — do not delete that file.

- [ ] **Step 2: Prune now-dead rollup helpers**

Grep the same way for `formsStats`, `docsStats`, `earliestActiveDeadline`, `docAttentionPill`, `progressPct`. Expected consumers after the rewrites: only `lib/forms/rollup.ts` itself and `lib/forms/__tests__/rollup.test.ts`. For each helper with no other consumer: delete the function from `rollup.ts` and its assertions/`describe` blocks from `rollup.test.ts`. If a helper IS still consumed elsewhere (e.g. a dashboard import), keep it and note which.

- [ ] **Step 3: Prune dead i18n keys from ALL 5 catalogs**

Delete these keys (grep each leaf key name across `--include="*.tsx" --include="*.ts"` minus `messages/` first; keep any key that still has a consumer and note it):

From `organizer.forms`: `subtitle`, `activeFormsCount`, `studentsConcerned`, `requestedInLabel`, `requestedInValue`, `responsesReceivedLabel`, `autoSendBanner`, `standardBadge`, `customBadge`, `previewButton`, `editButton`, the whole `deleteButton` object, `addPanel.pdfTile` (whole object), `addPanel.onlineTile` (whole object).

From `organizer.documents`: `subtitle`, `requestedCount`, `studentsConcerned`, `toReviewCount`, `receivedLabel`, `bannerText`, `bannerTextWithDeadline`, `standardBadge`, `customBadge`, `detailButton`, `addPanel.addButton`, `addPanel.mandatoryTile.description`, `addPanel.conditionalTile.description`.

KEEP (still consumed): `forms.addFormLabel`, `forms.close`, `forms.yourFormsCount`, `forms.deleteConfirm`, `forms.drawer.*`, `forms.editor.*`, `forms.pills.*`, `forms.progress.*`, remaining `forms.addPanel.*` fields, `documents.title`, `documents.requestedHeading`, `documents.addDocLabel`, `documents.close`, `documents.editButton` (DocDrawer uses it), `documents.deleteConfirm`, `documents.drawer.*`, remaining `documents.addPanel.*` (incl. `mandatoryTile.title`, `conditionalTile.title`).

- [ ] **Step 4: Run the full gate**

```bash
pnpm lint
pnpm test
pnpm build   # if it fails only on placeholder env vars (known local issue), run: npx tsc --noEmit
pnpm test:rls
```

Expected: all PASS (parity test proves the 5 catalogs pruned identically). Fix anything that surfaces before committing.

- [ ] **Step 5: Commit**

```bash
git add -u lib/forms/rollup.ts lib/forms/__tests__/rollup.test.ts messages/fr.json messages/en.json messages/es.json messages/it.json messages/de.json
git commit -m "chore(forms): delete replaced components, dead rollup helpers and pruned i18n keys"
```

(`git rm` in Steps 1 already staged the deletions; `git add -u` on the named files stages the modifications only.)

---

### Task 13: Finish — verification, PR

- [ ] **Step 1: Re-run the full Verifying Changes gate on the branch tip** (same commands as Task 12 Step 4). All green.

- [ ] **Step 2: Use superpowers:requesting-code-review / finishing-a-development-branch**, then open the PR:

```bash
git push -u origin feature/forms-page-redesign
gh pr create --title "Forms/documents page redesign: A4 card grid + library drawer" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-07-16-forms-page-redesign-design.md.

- Portrait A4 preview cards (client pdf.js thumbnails, cached) on /forms and /documents
- Standard library moved from auto-seeding to a searchable right drawer (+ Ajouter)
- New addStandardTemplate action; seedStandardTemplates deleted
- Data-only migration deletes pristine seeded drafts (applied to STAGING already)

## Merge-time steps
1. Apply migration `*_drop_pristine_seeded_drafts.sql` to PROD via MCP apply_migration; verify with list_migrations (git mv the file if the stamped version differs).
2. Merge with a merge commit; CI (unit → rls → deploy) ships it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Do NOT merge.** Bjorn merges with a merge commit and runs the merge-time steps.

---

## Self-Review Notes (already applied)

- Spec table's four preview modes ↔ `previewMode` + `TemplateCard` branches; count label `—` for drafts ↔ `cardCountLabel`.
- Drawer continuation (`onAdded` → close + open detail drawer) matches the old `onCreated` behavior; the detail drawer appears once the server action's `revalidatePath` refresh delivers the new template row (same as today).
- `addStandardTemplate` returns structured results (error-redaction convention); duplicate handled via the existing partial unique index `form_templates_standard_key_unique`, error code 23505.
- `documents.editButton` deliberately survives the prune (DocDrawer consumer).
- Type consistency: `CreateTemplateResult` reused for `addStandardTemplate`; `LibraryFamily` matches `getTemplatesPage`'s `family` values (`'forms' | 'docs'`); `TemplateVM` unchanged.
