# Make forms & document upload usable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the core forms/documents flow usable in production: structured validation results (no more opaque prod errors), activation readiness hints, the real 8-item standard library, deletable standard templates, an `external_url` link pattern (ESTA), and the school's real PDFs prepared for upload.

**Architecture:** Server actions in `actions/forms.ts` switch from thrown French validation errors to structured `{ ok, message }` returns (prod redacts thrown Server Action messages — pattern: `lib/billing/exchange-limit.ts`). Client callers render the returned message inline. One migration adds `form_templates.external_url` and reseeds the standard library (SQL snapshot, same approach as `20260703000001`). The TS library in `lib/forms/standard-library.ts` is rewritten to the same 8-item set for new exchanges.

**Tech Stack:** Next.js App Router + Server Actions, Supabase (Postgres/RLS/Storage, MCP for prod migrations), vitest + @testing-library/react, Tailwind, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-15-forms-upload-usable-design.md` (approved 2026-07-15).

## Global Constraints

- **Working directory for ALL tasks:** `/home/bjorn/eazyexchange-worktrees/forms-upload-usable` (branch `feature/forms-upload-usable`). Verify with `git branch --show-current` before every commit (concurrent sessions have moved HEAD before).
- All user-facing copy is **hardcoded French** with **typographic apostrophes `’` (U+2019)**, matching surrounding components. No i18n — the i18n phase 2/3 sweep picks it up later. Copy every French string from this plan **verbatim**.
- Expected outcomes (validation) → **structured return values**; only genuinely unexpected failures (DB/auth/storage-infra) still `throw`. Error strings `'Unauthorized'` / `'Unauthenticated'` are load-bearing for tests.
- Package manager is **pnpm**. Never `npm`.
- **Never hand-edit `types/supabase.ts`** — it is regenerated from prod via MCP `generate_typescript_types`.
- Migration flow: staging FIRST, then prod via MCP `apply_migration`; never `supabase db push` against prod. Prod's ledger is the source of truth for versions (`git mv` local file if stamped differently).
- Commits: **stage only named files** (`git add <file> <file>`), never `git add -A` — `docs/exampleSchoolFiles/` contains untracked school files that must never enter git history.
- The `pdf` pipeline stays PDF-only (`application/pdf`, 10 Mo max). No .docx support.
- Verification gate per task: the commands listed in that task. Full gate at the end: `pnpm lint && pnpm test && npx tsc --noEmit && pnpm build` (+ `pnpm test:rls` because a migration ships).

## File Structure

| File | Responsibility |
|---|---|
| `lib/forms/template-result.ts` (create) | Result types + shared activation-blocker message constants (importable by both `'use server'` actions and client components) |
| `actions/forms.ts` (modify) | 4 actions converted to structured results; `deleteTemplate` standard-key guard removed |
| `lib/forms/rollup.ts` (modify) | `TemplateVM.external_url`; new pure `activationHints()` |
| `lib/forms/standard-library.ts` (rewrite) | New 8-item library, `external_url` on `esta` |
| `supabase/migrations/20260715000001_external_url_standard_library_reseed.sql` (create) | `external_url` column + draft reseed for existing exchanges |
| `components/forms/FormDrawer.tsx`, `components/documents/DocDrawer.tsx` (modify) | Structured-result handling, readiness hints, delete for standard, show external link |
| `components/forms/AddFormPanel.tsx`, `components/documents/AddDocPanel.tsx` (modify) | Consume `CreateTemplateResult` |
| `components/forms/TemplateEditor.tsx` (modify) | Structured-result handling + « Lien externe » field |
| `components/forms/FormsView.tsx`, `components/documents/DocsView.tsx` (modify) | Row delete button no longer gated on custom-only |
| `components/ExternalLinkCard.tsx` (create) | Student-facing external-step button (name + verifiable URL) |
| `app/(student)/my-forms/[assignmentId]/page.tsx` (modify) | Render `ExternalLinkCard` above the upload form |
| `types/supabase.ts` (regenerate via MCP), `.gitignore` (modify) | Generated types; guard against committing school files |

Tests touched: `actions/__tests__/forms-phase3.test.ts`, `lib/forms/__tests__/standard-library.test.ts` (rewrite), `lib/forms/__tests__/rollup.test.ts`, `components/forms/__tests__/FormsView.test.tsx`, `components/forms/__tests__/TemplateEditor.test.tsx`, `components/documents/__tests__/DocsView.test.tsx`, `components/__tests__/ExternalLinkCard.test.tsx` (create).

---

### Task 1: Structured results in `actions/forms.ts`

Convert `createDraftTemplate`, `updateTemplateMeta`, `replaceTemplateFile`, `activateTemplate` from thrown French validation errors to structured returns. DB/storage-infra/auth errors still throw.

**Files:**
- Create: `lib/forms/template-result.ts`
- Modify: `actions/forms.ts`
- Test: `actions/__tests__/forms-phase3.test.ts`

**Interfaces:**
- Consumes: existing `requireUser`/`requireOrganizer` (`lib/auth/require.ts`), `assertExchangeWritable` (`lib/exchange-guard.ts`) — unchanged, both still throw.
- Produces (later tasks rely on these exact shapes):
  - `type TemplateActionResult = { ok: true } | { ok: false; message: string }`
  - `type CreateTemplateResult = { ok: true; id: string } | { ok: false; message: string }`
  - `activateTemplate(id: string, studentIds?: string[]): Promise<TemplateActionResult>`
  - `createDraftTemplate(formData: FormData): Promise<CreateTemplateResult>`
  - `updateTemplateMeta(id, meta: { name: string; description: string | null; deadline: string | null; condition_label: string | null }): Promise<TemplateActionResult>` (Task 7 adds `external_url` to `meta`)
  - `replaceTemplateFile(formData: FormData): Promise<TemplateActionResult>`
  - Constants `MSG_DEADLINE_REQUIRED`, `MSG_PDF_REQUIRED`, `MSG_QUESTIONS_REQUIRED` (Task 3's hints reuse them so hint copy always matches the action's message).

- [ ] **Step 1: Create the shared result module**

Create `lib/forms/template-result.ts`:

```ts
// Shared contract for the template server actions' *expected* outcomes.
// Lives outside the 'use server' module so values (messages) and types can be
// imported by both the actions and client components — a 'use server' file may
// only export async functions. Production redacts thrown Server Action error
// messages, so expected validation outcomes must travel as return values
// (pattern: lib/billing/exchange-limit.ts).

export const MSG_DEADLINE_REQUIRED = 'Ajoutez une échéance avant d’activer.'
export const MSG_PDF_REQUIRED = 'Téléversez le PDF avant d’activer.'
export const MSG_QUESTIONS_REQUIRED = 'Ajoutez au moins une question avant d’activer.'

export type TemplateActionResult = { ok: true } | { ok: false; message: string }
export type CreateTemplateResult = { ok: true; id: string } | { ok: false; message: string }
```

- [ ] **Step 2: Write the failing tests**

In `actions/__tests__/forms-phase3.test.ts`:

Replace the existing `import { activateTemplate, deleteTemplate, remindTemplate } from '@/actions/forms'` line with:

```ts
import { activateTemplate, deleteTemplate, remindTemplate, createDraftTemplate, updateTemplateMeta, replaceTemplateFile } from '@/actions/forms'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'
```

Extend the mock `from` factory: add an `insert` to the `form_templates` branch and a `document_slots` branch. Replace the `if (table === 'form_templates')` block with:

```ts
  if (table === 'form_templates') {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: template }), maybeSingle: async () => ({ data: template }) }) }),
      insert: templateInsert,
      update: templateUpdate,
      delete: templateDelete,
    }
  }
  if (table === 'document_slots') {
    return { insert: async () => ({ error: null }) }
  }
```

and add next to the other top-level mock fns (near `templateUpdate`):

```ts
const templateInsert = vi.fn().mockReturnValue({
  select: () => ({ single: async () => ({ data: { id: 'new-tpl' }, error: null }) }),
})
```

Replace the four rejection tests inside `describe('activateTemplate', ...)` with structured-result versions, and add an `{ ok: true }` assertion to the two success tests:

```ts
  it('returns a structured error for a draft without deadline', async () => {
    template.deadline = null
    await expect(activateTemplate('tpl-1')).resolves.toEqual({ ok: false, message: MSG_DEADLINE_REQUIRED })
    expect(templateUpdate).not.toHaveBeenCalled()
  })
  it('returns a structured error for a pdf without file', async () => {
    template.kind = 'pdf'
    await expect(activateTemplate('tpl-1')).resolves.toEqual({ ok: false, message: MSG_PDF_REQUIRED })
  })
  it('returns a structured error for an online form without questions', async () => {
    template.kind = 'online'
    template.form_fields = []
    await expect(activateTemplate('tpl-1')).resolves.toEqual({ ok: false, message: MSG_QUESTIONS_REQUIRED })
  })
  it('returns a structured error for a conditional doc without chosen students', async () => {
    template.audience = 'conditional'
    await expect(activateTemplate('tpl-1')).resolves.toEqual({ ok: false, message: 'Choisissez au moins un élève concerné.' })
  })
  it('activates an « all » doc and inserts no assignments itself (trigger does it)', async () => {
    await expect(activateTemplate('tpl-1')).resolves.toEqual({ ok: true })
    expect(templateUpdate).toHaveBeenCalledWith({ status: 'active' })
    expect(assignmentInsert).not.toHaveBeenCalled()
  })
  it('activates a conditional doc inserting assignments for enrolled choices', async () => {
    template.audience = 'conditional'
    enrolledUsers = [{ id: 'stu-1', full_name: 'Léa' }, { id: 'stu-2', full_name: 'Hugo' }]
    await expect(activateTemplate('tpl-1', ['stu-1'])).resolves.toEqual({ ok: true })
    expect(assignmentInsert).toHaveBeenCalledWith([{ template_id: 'tpl-1', student_id: 'stu-1' }])
  })
  it('returns a structured error for conditional choices that are not enrolled students', async () => {
    template.audience = 'conditional'
    enrolledUsers = [{ id: 'stu-1', full_name: 'Léa' }]
    await expect(activateTemplate('tpl-1', ['stu-1', 'ghost'])).resolves.toEqual({ ok: false, message: 'Sélection invalide : élève non inscrit à cet échange.' })
  })
  it('non-organizer is rejected', async () => {
    role = 'student'
    await expect(activateTemplate('tpl-1')).rejects.toThrow(/Unauthorized/)
  })
```

Add two new describes after `describe('activateTemplate', ...)`:

```ts
describe('createDraftTemplate — structured results', () => {
  function fd(entries: Record<string, string>) {
    const f = new FormData()
    for (const [k, v] of Object.entries(entries)) f.set(k, v)
    return f
  }
  it('returns a structured error when the name is empty', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'doc', name: '  ' }))
    expect(res).toEqual({ ok: false, message: 'Donnez un nom au modèle.' })
    expect(templateInsert).not.toHaveBeenCalled()
  })
  it('returns a structured error for a pdf kind without file', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'pdf', name: 'Autorisation' }))
    expect(res).toEqual({ ok: false, message: 'Téléversez le PDF à faire signer.' })
  })
  it('returns the new id on success', async () => {
    const res = await createDraftTemplate(fd({ exchange_id: 'ex-1', kind: 'doc', name: 'Passeport' }))
    expect(res).toEqual({ ok: true, id: 'new-tpl' })
  })
})

describe('updateTemplateMeta / replaceTemplateFile — structured results', () => {
  it('updateTemplateMeta returns a structured error when the name is empty', async () => {
    const res = await updateTemplateMeta('tpl-1', { name: ' ', description: null, deadline: '2026-10-10', condition_label: null })
    expect(res).toEqual({ ok: false, message: 'Le nom ne peut pas être vide.' })
  })
  it('updateTemplateMeta refuses removing the deadline of an active template', async () => {
    template.status = 'active'
    const res = await updateTemplateMeta('tpl-1', { name: 'Passeport', description: null, deadline: null, condition_label: null })
    expect(res).toEqual({ ok: false, message: 'Un modèle actif doit garder une échéance.' })
  })
  it('updateTemplateMeta returns ok on success', async () => {
    const res = await updateTemplateMeta('tpl-1', { name: 'Passeport', description: null, deadline: '2026-10-10', condition_label: null })
    expect(res).toEqual({ ok: true })
  })
  it('replaceTemplateFile returns a structured error on a non-pdf template', async () => {
    const f = new FormData()
    f.set('template_id', 'tpl-1')
    f.set('file', new File(['x'], 'x.pdf', { type: 'application/pdf' }))
    const res = await replaceTemplateFile(f)  // template.kind is 'doc' in beforeEach
    expect(res).toEqual({ ok: false, message: 'Ce modèle n’a pas de PDF.' })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test actions/__tests__/forms-phase3.test.ts`
Expected: FAIL — the four converted actions still throw / return `void`/`string` (e.g. `resolves.toEqual` receives a rejection, `createDraftTemplate` returns a bare id string).

- [ ] **Step 4: Convert the actions**

In `actions/forms.ts`:

Add to imports (top of file):

```ts
import type { TemplateActionResult, CreateTemplateResult } from '@/lib/forms/template-result'
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'
```

Replace `requireValidPdf` and `uploadTemplatePdf` (keep `const PDF_MAX_BYTES` as is):

```ts
// Expected validation outcome — returned, never thrown (prod redacts throws).
function pdfProblem(file: File): string | null {
  if (file.type !== 'application/pdf') return 'Le fichier doit être un PDF.'
  if (file.size > PDF_MAX_BYTES) return 'Le PDF dépasse 10 Mo.'
  return null
}

async function uploadTemplatePdf(
  supabase: SupabaseClient, schoolId: string, templateId: string, file: File,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const problem = pdfProblem(file)
  if (problem) return { ok: false, message: problem }
  const path = `${schoolId}/${templateId}.pdf`
  const { error } = await supabase.storage
    .from('form-templates')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' })
  // Bucket-side size/MIME rejections are expected outcomes, not crashes.
  if (error) return { ok: false, message: 'Le téléversement du PDF a échoué. Réessayez.' }
  return { ok: true, path }
}
```

Replace `createDraftTemplate` entirely:

```ts
export async function createDraftTemplate(formData: FormData): Promise<CreateTemplateResult> {
  const supabase = await createClient()
  const user = await requireUser()
  const schoolId = await assertOrganizer()

  const exchangeId = formData.get('exchange_id') as string
  await assertExchangeWritable(supabase, exchangeId)
  const kind = formData.get('kind') as TemplateKind
  const name = ((formData.get('name') as string) ?? '').trim()
  const deadline = ((formData.get('deadline') as string) ?? '').trim() || null
  const audience = (formData.get('audience') as string) === 'conditional' ? 'conditional' : 'all'
  const conditionLabel = ((formData.get('condition_label') as string) ?? '').trim() || null
  const file = formData.get('file') as File | null

  if (!['online', 'pdf', 'doc'].includes(kind)) return { ok: false, message: 'Type de modèle invalide.' }
  if (!name) return { ok: false, message: 'Donnez un nom au modèle.' }
  if (audience === 'conditional' && kind !== 'doc') return { ok: false, message: 'Seules les pièces peuvent être conditionnelles.' }
  if (kind === 'pdf') {
    if (!file || file.size === 0) return { ok: false, message: 'Téléversez le PDF à faire signer.' }
    const problem = pdfProblem(file)
    if (problem) return { ok: false, message: problem }
  }

  const { data, error } = await supabase.from('form_templates').insert({
    exchange_id: exchangeId,
    school_id: schoolId,
    name,
    description: null,
    type: kind === 'online' ? 'data_entry' : 'document_upload',
    kind,
    status: 'draft',
    audience,
    condition_label: audience === 'conditional' ? conditionLabel : null,
    deadline,
    created_by: user.id,
  }).select('id').single()
  if (error) throw error
  const templateId = data.id as string

  try {
    if (kind !== 'online') {
      const { error: slotError } = await supabase
        .from('document_slots')
        .insert({ template_id: templateId, label: name, description: null, required: true, order: 0 })
      if (slotError) throw slotError
    }
    if (kind === 'pdf' && file) {
      const uploaded = await uploadTemplatePdf(supabase, schoolId, templateId, file)
      if (!uploaded.ok) {
        // Don't leave a half-configured draft behind.
        await supabase.from('form_templates').delete().eq('id', templateId)
        return { ok: false, message: uploaded.message }
      }
      const { error: pathError } = await supabase
        .from('form_templates').update({ template_file_path: uploaded.path }).eq('id', templateId)
      if (pathError) throw pathError
    }
  } catch (err) {
    // Don't leave a half-configured draft behind.
    await supabase.from('form_templates').delete().eq('id', templateId)
    throw err
  }

  revalidatePath(kind === 'doc' ? '/documents' : '/forms', 'layout')
  return { ok: true, id: templateId }
}
```

Replace `updateTemplateMeta` (same body except return type + the two validations return instead of throw + final `return { ok: true }`):

```ts
export async function updateTemplateMeta(
  id: string,
  meta: { name: string; description: string | null; deadline: string | null; condition_label: string | null },
): Promise<TemplateActionResult> {
  const supabase = await createClient()
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  const name = meta.name.trim()
  if (!name) return { ok: false, message: 'Le nom ne peut pas être vide.' }
  if (tmpl.status === 'active' && !meta.deadline) return { ok: false, message: 'Un modèle actif doit garder une échéance.' }

  const { error } = await supabase.from('form_templates').update({
    name,
    description: meta.description?.trim() || null,
    deadline: meta.deadline || null,
    condition_label: tmpl.audience === 'conditional' ? (meta.condition_label?.trim() || null) : null,
  }).eq('id', id)
  if (error) throw error
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')
  // Name/deadline also feed the dashboard grid and the exchange cards' %
  // complete once the template is active.
  revalidatePath('/dashboard')
  revalidatePath('/exchanges')
  return { ok: true }
}
```

Replace `replaceTemplateFile`:

```ts
export async function replaceTemplateFile(formData: FormData): Promise<TemplateActionResult> {
  const supabase = await createClient()
  await requireUser()
  const id = formData.get('template_id') as string
  const file = formData.get('file') as File | null
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.kind !== 'pdf') return { ok: false, message: 'Ce modèle n’a pas de PDF.' }
  if (!file || file.size === 0) return { ok: false, message: 'Choisissez un fichier PDF.' }

  const uploaded = await uploadTemplatePdf(supabase, tmpl.school_id, id, file)
  if (!uploaded.ok) return { ok: false, message: uploaded.message }
  const { error } = await supabase.from('form_templates').update({ template_file_path: uploaded.path }).eq('id', id)
  if (error) throw error
  revalidatePath('/forms', 'layout')
  return { ok: true }
}
```

Replace `activateTemplate`'s signature and validation section (the DB writes and revalidations at the end stay identical, plus a final `return { ok: true }`):

```ts
export async function activateTemplate(id: string, studentIds?: string[]): Promise<TemplateActionResult> {
  const supabase = await createClient()
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)
  if (tmpl.status === 'active') return { ok: true }

  if (!tmpl.deadline) return { ok: false, message: MSG_DEADLINE_REQUIRED }
  if (tmpl.kind === 'pdf' && !tmpl.template_file_path) return { ok: false, message: MSG_PDF_REQUIRED }
  if (tmpl.kind === 'online' && (tmpl.form_fields ?? []).length === 0) return { ok: false, message: MSG_QUESTIONS_REQUIRED }

  let chosen: string[] = []
  if (tmpl.audience === 'conditional') {
    if (!studentIds || studentIds.length === 0) return { ok: false, message: 'Choisissez au moins un élève concerné.' }
    // Only enrolled students of our school may be targeted.
    const { data: enrollments } = await supabase
      .from('exchange_enrollments').select('user_id').eq('exchange_id', tmpl.exchange_id)
    const enrolledIds = new Set((enrollments ?? []).map((e) => e.user_id))
    const { data: validUsers } = await supabase
      .from('users').select('id')
      .in('id', studentIds).eq('school_id', tmpl.school_id).eq('role', 'student')
    const validIds = new Set((validUsers ?? []).map((u) => u.id))
    chosen = studentIds.filter(sid => enrolledIds.has(sid) && validIds.has(sid))
    if (chosen.length !== studentIds.length) return { ok: false, message: 'Sélection invalide : élève non inscrit à cet échange.' }
  }

  const { error } = await supabase.from('form_templates').update({ status: 'active' }).eq('id', id)
  if (error) throw error

  if (tmpl.audience === 'conditional' && chosen.length > 0) {
    const { error: insertError } = await supabase
      .from('assignments')
      .insert(chosen.map(sid => ({ template_id: id, student_id: sid })))
    if (insertError) throw insertError
  }

  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')
  // Newly active → now appears in the dashboard grid and exchange % complete.
  revalidatePath('/dashboard')
  revalidatePath('/exchanges')
  return { ok: true }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test actions/__tests__/forms-phase3.test.ts actions/__tests__/forms.test.ts`
Expected: PASS (forms.test.ts covers addField/removeField, untouched — must stay green).

Then run the full `pnpm test`. The component suites should stay green (their action mocks resolve to `undefined`/id-strings and the components still treat any resolution as success). If a component test does fail here, it belongs to Task 2's subject — in that case do not commit a red suite: implement Task 2 and commit Tasks 1+2 together.

- [ ] **Step 6: Commit**

```bash
git add lib/forms/template-result.ts actions/forms.ts actions/__tests__/forms-phase3.test.ts
git commit -m "feat(forms): structured results for template actions (prod-safe validation)"
```

---

### Task 2: Callers consume structured results

`FormDrawer`, `DocDrawer`, `AddFormPanel`, `AddDocPanel`, `TemplateEditor` read the returned message instead of `err.message` (which prod redacts). Thrown (unexpected) failures keep the generic « Une erreur est survenue. » fallback.

**Files:**
- Modify: `components/forms/FormDrawer.tsx`, `components/documents/DocDrawer.tsx`, `components/forms/AddFormPanel.tsx`, `components/documents/AddDocPanel.tsx`, `components/forms/TemplateEditor.tsx`
- Test: `components/forms/__tests__/FormsView.test.tsx`, `components/documents/__tests__/DocsView.test.tsx`, `components/forms/__tests__/TemplateEditor.test.tsx`

**Interfaces:**
- Consumes: Task 1's action signatures and result shapes (exactly as listed there).
- Produces: nothing new — behavior only.

- [ ] **Step 1: Update the test mocks and add failing structured-error tests**

`components/forms/__tests__/FormsView.test.tsx` — change the mock resolutions:

```ts
const createDraft = vi.fn().mockResolvedValue({ ok: true, id: 'new-id' })
const activate = vi.fn().mockResolvedValue({ ok: true })
```

Add a new test at the end of the describe:

```ts
  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = vm({ id: 'd1', status: 'draft', kind: 'online', fields: ['Q1'], assignees: [], template_file_path: null, deadline: null })
    renderWith(<FormsView exchangeId="ex1" templates={[draft]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })
```

(`findAllByText`: Task 3 will render the same string as a pre-click hint, so a single-match assertion would break there — the assertion only requires the message to be visible.)

`components/documents/__tests__/DocsView.test.tsx` — change the mocks:

```ts
const activate = vi.fn().mockResolvedValue({ ok: true })
...
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue({ ok: true, id: 'new-id' }),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
}))
```

Add:

```ts
  it('drawer shows the structured activation message inline', async () => {
    activate.mockResolvedValueOnce({ ok: false, message: 'Ajoutez une échéance avant d’activer.' })
    const draft = doc({ id: 'd2', status: 'draft', assignees: [], deadline: null })
    render(<DocsView exchangeId="ex1" templates={[draft]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))
    expect(await screen.findAllByText('Ajoutez une échéance avant d’activer.')).not.toHaveLength(0)
  })
```

`components/forms/__tests__/TemplateEditor.test.tsx` — change the mocks:

```ts
const updateMeta = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/actions/forms', () => ({
  updateTemplateMeta: (...a: unknown[]) => updateMeta(...a),
  replaceTemplateFile: vi.fn().mockResolvedValue({ ok: true }),
  addField: vi.fn().mockResolvedValue(undefined),
  removeField: vi.fn().mockResolvedValue(undefined),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
```

Add:

```ts
  it('shows the structured save error inline', async () => {
    updateMeta.mockResolvedValueOnce({ ok: false, message: 'Un modèle actif doit garder une échéance.' })
    render(<TemplateEditor template={{ ...base, status: 'active' }} backHref="/forms" backLabel="Retour aux formulaires" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Un modèle actif doit garder une échéance.')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm test components/forms components/documents`
Expected: the three new tests FAIL (message never rendered — components currently only set errors from `catch`).

- [ ] **Step 3: Update the components**

`components/forms/FormDrawer.tsx` — keep `run()` for delete; give activation its own handler:

```tsx
  async function handleActivate() {
    setBusy(true)
    setError(null)
    try {
      const res = await activateTemplate(vm!.id, undefined)
      if (!res.ok) setError(res.message)
    } catch {
      setError('Une erreur est survenue.')
    }
    setBusy(false)
  }
```

and change the button to use it:

```tsx
            <button type="button" disabled={busy} onClick={handleActivate}
```

`components/documents/DocDrawer.tsx` — replace `handleActivate`:

```tsx
  function handleActivate() {
    if (needsPicker && !picking) { setPicking(true); return }
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        const res = await activateTemplate(vm!.id, needsPicker ? chosen : undefined)
        if (!res.ok) setError(res.message)
      } catch {
        setError('Une erreur est survenue.')
      }
      setBusy(false)
    })()
  }
```

`components/forms/AddFormPanel.tsx` — replace the body of `handleCreate`'s `try/catch`:

```tsx
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', mode)
      fd.set('name', name)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'pdf' && file) fd.set('file', file)
      const res = await createDraftTemplate(fd)
      if (!res.ok) {
        setError(res.message)
        setBusy(false)
        return
      }
      onCreated(res.id)
    } catch {
      setError('Une erreur est survenue.')
      setBusy(false)
    }
```

`components/documents/AddDocPanel.tsx` — same change to its `handleCreate`:

```tsx
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', 'doc')
      fd.set('name', name)
      fd.set('audience', mode)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'conditional' && condition) fd.set('condition_label', condition)
      const res = await createDraftTemplate(fd)
      if (!res.ok) {
        setError(res.message)
        setBusy(false)
        return
      }
      onCreated(res.id)
    } catch {
      setError('Une erreur est survenue.')
      setBusy(false)
    }
```

`components/forms/TemplateEditor.tsx` — replace `handleSave` and `handleReplaceFile`:

```tsx
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await updateTemplateMeta(template.id, {
        name,
        description: description.trim() || null,
        deadline: deadline || null,
        condition_label: template.audience === 'conditional' ? (conditionLabel.trim() || null) : null,
      })
      if (res.ok) setSaved(true)
      else setError(res.message)
    } catch {
      setError('Une erreur est survenue.')
    }
    setBusy(false)
  }

  async function handleReplaceFile(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('template_id', template.id)
      fd.set('file', file)
      const res = await replaceTemplateFile(fd)
      if (res.ok) setFile(null)
      else setError(res.message)
    } catch {
      setError('Une erreur est survenue.')
    }
    setBusy(false)
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test components/forms components/documents`
Expected: PASS, including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add components/forms/FormDrawer.tsx components/documents/DocDrawer.tsx components/forms/AddFormPanel.tsx components/documents/AddDocPanel.tsx components/forms/TemplateEditor.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx components/forms/__tests__/TemplateEditor.test.tsx
git commit -m "feat(forms): render structured action results inline in drawers, panels and editor"
```

---

### Task 3: Activation readiness hints

Draft drawers list what still blocks activation *before* the click, computed from the `TemplateVM` they already have. Hint copy reuses the exact action messages (single source in `lib/forms/template-result.ts`); each hint links to the editor.

**Files:**
- Modify: `lib/forms/rollup.ts`, `components/forms/FormDrawer.tsx`, `components/documents/DocDrawer.tsx`
- Test: `lib/forms/__tests__/rollup.test.ts`, `components/forms/__tests__/FormsView.test.tsx`, `components/documents/__tests__/DocsView.test.tsx`

**Interfaces:**
- Consumes: `MSG_DEADLINE_REQUIRED` / `MSG_PDF_REQUIRED` / `MSG_QUESTIONS_REQUIRED` from `lib/forms/template-result` (Task 1); `TemplateVM` fields `status`, `kind`, `deadline`, `template_file_path`, `fields`.
- Produces: `activationHints(t: Pick<TemplateVM, 'status' | 'kind' | 'deadline' | 'template_file_path' | 'fields'>): string[]` exported from `lib/forms/rollup.ts`.

- [ ] **Step 1: Write the failing unit tests**

Append to `lib/forms/__tests__/rollup.test.ts` (it already imports from `@/lib/forms/rollup`; add `activationHints` to that import):

```ts
describe('activationHints', () => {
  const base = { status: 'draft' as const, kind: 'doc' as const, deadline: '2026-10-10', template_file_path: null, fields: [] as string[] }
  it('is empty for an active template', () => {
    expect(activationHints({ ...base, status: 'active', deadline: null })).toEqual([])
  })
  it('is empty for a ready draft', () => {
    expect(activationHints(base)).toEqual([])
  })
  it('flags a missing deadline', () => {
    expect(activationHints({ ...base, deadline: null })).toEqual(['Ajoutez une échéance avant d’activer.'])
  })
  it('flags a missing PDF on pdf kind only', () => {
    expect(activationHints({ ...base, kind: 'pdf' })).toEqual(['Téléversez le PDF avant d’activer.'])
    expect(activationHints({ ...base, kind: 'doc' })).toEqual([])
  })
  it('flags missing questions on online kind and stacks with missing deadline', () => {
    expect(activationHints({ ...base, kind: 'online', deadline: null })).toEqual([
      'Ajoutez une échéance avant d’activer.',
      'Ajoutez au moins une question avant d’activer.',
    ])
    expect(activationHints({ ...base, kind: 'online', fields: ['Q1'] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test lib/forms/__tests__/rollup.test.ts`
Expected: FAIL — `activationHints` is not exported.

- [ ] **Step 3: Implement `activationHints`**

In `lib/forms/rollup.ts`, add at the top:

```ts
import { MSG_DEADLINE_REQUIRED, MSG_PDF_REQUIRED, MSG_QUESTIONS_REQUIRED } from '@/lib/forms/template-result'
```

and after the `TemplateVM` type:

```ts
// What still blocks activation of a draft — same wording as the action's
// structured messages, so the pre-click hint and the post-click error match.
export function activationHints(
  t: Pick<TemplateVM, 'status' | 'kind' | 'deadline' | 'template_file_path' | 'fields'>,
): string[] {
  if (t.status !== 'draft') return []
  const hints: string[] = []
  if (!t.deadline) hints.push(MSG_DEADLINE_REQUIRED)
  if (t.kind === 'pdf' && !t.template_file_path) hints.push(MSG_PDF_REQUIRED)
  if (t.kind === 'online' && t.fields.length === 0) hints.push(MSG_QUESTIONS_REQUIRED)
  return hints
}
```

Run: `pnpm test lib/forms/__tests__/rollup.test.ts` — Expected: PASS.

- [ ] **Step 4: Write the failing component tests**

`components/forms/__tests__/FormsView.test.tsx`, add:

```ts
  it('drawer lists readiness hints for an unready draft, each linking to the editor', () => {
    const draft = vm({ id: 'd9', status: 'draft', kind: 'pdf', deadline: null, template_file_path: null, assignees: [] })
    renderWith(<FormsView exchangeId="ex1" templates={[draft]} studentCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByText(/Téléversez le PDF avant d’activer\./)).toBeInTheDocument()
    const editLinks = screen.getAllByRole('link', { name: 'Modifier le modèle' })
    expect(editLinks.length).toBeGreaterThanOrEqual(2)
    for (const l of editLinks) expect(l).toHaveAttribute('href', '/forms/d9')
  })
```

`components/documents/__tests__/DocsView.test.tsx`, add:

```ts
  it('drawer lists the missing-deadline hint for an unready draft doc', () => {
    const draft = doc({ id: 'd9', status: 'draft', deadline: null, assignees: [] })
    render(<DocsView exchangeId="ex1" templates={[draft]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    expect(screen.getByText(/Ajoutez une échéance avant d’activer\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Modifier le modèle' })).toHaveAttribute('href', '/documents/d9')
  })
```

Run: `pnpm test components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx`
Expected: the two new tests FAIL.

- [ ] **Step 5: Render the hints in both drawers**

`components/forms/FormDrawer.tsx`: add `activationHints` to the rollup import:

```tsx
import { typePill, statusPill, activationHints, type TemplateVM } from '@/lib/forms/rollup'
```

compute after the `if (!vm) return null` guard:

```tsx
  const hints = activationHints(vm)
```

and insert this block **between** the scrollable body's closing `</div>` and the footer `<div className="flex flex-none gap-2.5 border-t …">`:

```tsx
        {hints.length > 0 && (
          <div className="flex-none border-t bg-hoverrow px-[26px] py-3.5">
            <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">Avant d’activer</div>
            <ul className="flex flex-col gap-1">
              {hints.map((h) => (
                <li key={h} className="text-[12.5px] leading-normal text-muted-foreground">
                  {h}{' '}
                  <Link href={`/forms/${vm.id}`} className="font-semibold text-brand underline">Modifier le modèle</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
```

`components/documents/DocDrawer.tsx`: add `activationHints` to its rollup import:

```tsx
import { reqPill, progressLabel, docDrawerRows, activationHints, type TemplateVM } from '@/lib/forms/rollup'
```

compute after `const { rows, restCount } = docDrawerRows(vm.assignees)`:

```tsx
  const hints = activationHints(vm)
```

and insert the same block between the scrollable body and the footer, with the doc editor route:

```tsx
        {hints.length > 0 && (
          <div className="flex-none border-t bg-hoverrow px-[26px] py-3.5">
            <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">Avant d’activer</div>
            <ul className="flex flex-col gap-1">
              {hints.map((h) => (
                <li key={h} className="text-[12.5px] leading-normal text-muted-foreground">
                  {h}{' '}
                  <Link href={`/documents/${vm.id}`} className="font-semibold text-brand underline">Modifier le modèle</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
```

The « Activer » button stays enabled in both drawers — clicking surfaces the same structured message, so there is feedback either way.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test components/forms components/documents lib/forms`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/forms/rollup.ts lib/forms/__tests__/rollup.test.ts components/forms/FormDrawer.tsx components/documents/DocDrawer.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx
git commit -m "feat(forms): pre-activation readiness hints in the template drawers"
```

---

### Task 4: Standard templates become deletable

Remove the `standard_key` guard in `deleteTemplate`; show the delete button for standard templates in the drawers **and** in the row buttons of `FormsView`/`DocsView` (the spec names the drawers; the rows keep the same rule for consistency — the whole point is letting organizers remove irrelevant defaults, and a row-visible delete for custom but not standard would be confusing). The existing confirm dialogs already warn about submissions.

**Files:**
- Modify: `actions/forms.ts` (guard line in `deleteTemplate`), `components/forms/FormDrawer.tsx`, `components/documents/DocDrawer.tsx`, `components/forms/FormsView.tsx`, `components/documents/DocsView.tsx`
- Test: `actions/__tests__/forms-phase3.test.ts`, `components/forms/__tests__/FormsView.test.tsx`, `components/documents/__tests__/DocsView.test.tsx`

**Interfaces:**
- Consumes: `deleteTemplate(id): Promise<void>` — signature unchanged (it only throws for unexpected failures; no structured result needed).
- Produces: nothing new.

- [ ] **Step 1: Flip the action test**

In `actions/__tests__/forms-phase3.test.ts`, replace the `deleteTemplate` describe's first test (`'refuses standard templates'`) with:

```ts
  it('deletes standard templates too (guard removed)', async () => {
    template.standard_key = 'passeport'
    await deleteTemplate('tpl-1')
    expect(templateDelete).toHaveBeenCalled()
  })
```

Run: `pnpm test actions/__tests__/forms-phase3.test.ts` — Expected: FAIL (rejects with « Les modèles standard ne peuvent pas être supprimés. »).

- [ ] **Step 2: Remove the guard**

In `actions/forms.ts`, delete this line from `deleteTemplate`:

```ts
  if (tmpl.standard_key) throw new Error('Les modèles standard ne peuvent pas être supprimés.')
```

Run: `pnpm test actions/__tests__/forms-phase3.test.ts` — Expected: PASS.

- [ ] **Step 3: Flip the component tests**

`components/forms/__tests__/FormsView.test.tsx` — replace the test `'shows Supprimer only for custom templates'` with:

```ts
  it('shows Supprimer for standard templates too', () => {
    renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />)
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })
```

`components/documents/__tests__/DocsView.test.tsx` — replace `'shows Supprimer only for custom documents'` with:

```ts
  it('shows Supprimer for standard documents too', () => {
    render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
  })
```

Run: `pnpm test components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx` — Expected: the two flipped tests FAIL.

- [ ] **Step 4: Remove the four UI gates**

- `components/forms/FormDrawer.tsx`: remove the `{vm.standard_key === null && (` … `)}` wrapper around the Supprimer button (keep the button, always rendered).
- `components/documents/DocDrawer.tsx`: same — remove the `{vm.standard_key === null && (` … `)}` wrapper.
- `components/forms/FormsView.tsx`: replace

```tsx
                {t.standard_key === null && (
                  <DeleteTemplateButton templateId={t.id}
                    confirmText="Supprimer ce modèle ? Les réponses déjà envoyées par les élèves seront définitivement supprimées." />
                )}
```

with

```tsx
                <DeleteTemplateButton templateId={t.id}
                  confirmText="Supprimer ce modèle ? Les réponses déjà envoyées par les élèves seront définitivement supprimées." />
```

- `components/documents/DocsView.tsx`: same unwrap for its `DeleteTemplateButton` (confirmText « Supprimer cette pièce ? Les fichiers déjà envoyés par les familles seront définitivement supprimés. »).

- [ ] **Step 5: Run the tests, fix collateral selectors**

Run: `pnpm test components/forms components/documents`
Expected: PASS. Watch the pre-existing `'deletes a custom … when the confirm is accepted'` tests — the drawer is closed there, so only the row button exists and `getByRole('button', { name: 'Supprimer' })` stays unambiguous. If any test now sees two Supprimer buttons (drawer + row), use `getAllByRole(...)[0]`.

- [ ] **Step 6: Commit**

```bash
git add actions/forms.ts actions/__tests__/forms-phase3.test.ts components/forms/FormDrawer.tsx components/documents/DocDrawer.tsx components/forms/FormsView.tsx components/documents/DocsView.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx
git commit -m "feat(forms): standard templates are deletable"
```

---

### Task 5: Migration — `external_url` column + standard-library reseed (staging → prod → types)

One migration: add `form_templates.external_url`, delete still-draft standard templates, insert the new 8-item set for every existing exchange (SQL snapshot, skipping colliding `standard_key`s of active old-library templates). Then the CLAUDE.md post-apply ritual.

**Files:**
- Create: `supabase/migrations/20260715000001_external_url_standard_library_reseed.sql`
- Regenerate: `types/supabase.ts` (via MCP — never hand-edit)
- Test: `pnpm test:rls` + `npx tsc --noEmit`

**Interfaces:**
- Produces: column `form_templates.external_url text null` (readable wherever templates already are — RLS row policies are unchanged, no new policy needed). Generated types gain `external_url: string | null` on the `form_templates` row, which `types/db.ts` inherits automatically (its `FormTemplate` override only narrows `type/kind/status/audience`). Tasks 6–8 depend on this column existing in `types/supabase.ts`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260715000001_external_url_standard_library_reseed.sql` with exactly:

```sql
-- Forms-upload-usable: external instruction link on templates + rework of the
-- standard library to the real 8-item program. Frozen SQL snapshot of the new
-- lib/forms/standard-library.ts (which owns the data for exchanges created
-- from now on) — same approach as 20260703000001.

-- 1 · External link (e.g. ESTA application) ---------------------------------
-- Readable wherever templates already are; no policy changes.
alter table form_templates add column external_url text;

-- 2 · Reseed existing exchanges ----------------------------------------------
-- Drop old-library standard templates still in draft. Drafts have no
-- assignments/submissions by construction (the gated triggers skip drafts);
-- their form_fields/document_slots go with the ON DELETE CASCADE.
-- Active standard templates are left untouched.
delete from form_templates
where standard_key is not null and status = 'draft';

-- Insert the new 8-item set for every existing exchange, skipping any item
-- whose standard_key already exists on that exchange (an active old-library
-- template with a colliding key — decharge/passeport/ast — must not produce a
-- duplicate; the partial unique index form_templates_standard_key_unique
-- enforces the same). created_by = any organizer of the owning school;
-- exchanges without one are skipped.
with owner as (
  select e.id as exchange_id, e.school_a_id as school_id, u.id as user_id
  from exchanges e
  join lateral (
    select id from users
    where school_id = e.school_a_id and role = 'organizer' limit 1
  ) u on true
),
tpl (standard_key, kind, type, audience, name, description, external_url) as (
  values
    ('medical', 'pdf', 'document_upload', 'all', 'Autorisation médicale',
     'Autorisation de soins à télécharger, faire signer par les parents, puis redéposer signée.', null),
    ('decharge', 'pdf', 'document_upload', 'all', 'Décharge de responsabilité / code de conduite',
     'Décharge de responsabilité et code de conduite à signer par la famille et l''élève.', null),
    ('absence', 'pdf', 'document_upload', 'all', 'Demande d''absence',
     'Demande d''absence au lycée pour la durée de l''échange, à faire signer puis redéposer.', null),
    ('famille', 'pdf', 'document_upload', 'all', 'Engagement de famille',
     'Engagement de la famille d''accueil, à signer puis redéposer.', null),
    ('ast', 'pdf', 'document_upload', 'all', 'AST — autorisation de sortie du territoire (CERFA 15646)',
     'Formulaire CERFA 15646 signé par un titulaire de l''autorité parentale. Téléchargez le modèle, faites-le signer, puis redéposez-le.', null),
    ('passeport', 'doc', 'document_upload', 'all', 'Passeport de l''élève',
     'Copie du passeport de l''élève en cours de validité.', null),
    ('passeport-parent', 'doc', 'document_upload', 'all', 'Passeport du parent signataire de l''AST',
     'Copie du passeport du parent qui a signé l''AST — impérativement le même parent.', null),
    ('esta', 'doc', 'document_upload', 'all', 'ESTA — autorisation de voyage États-Unis',
     'Faites la demande ESTA en ligne, puis téléversez la preuve d''autorisation obtenue.', 'https://esta.cbp.dhs.gov')
)
insert into form_templates
  (exchange_id, school_id, name, description, type, kind, status, audience,
   standard_key, condition_label, external_url, created_by, deadline)
select o.exchange_id, o.school_id, t.name, t.description, t.type, t.kind,
       'draft', t.audience, t.standard_key, null, t.external_url, o.user_id, null
from owner o cross join tpl t
where not exists (
  select 1 from form_templates ft
  where ft.exchange_id = o.exchange_id and ft.standard_key = t.standard_key
);

-- One upload slot per standard pdf/doc template lacking one (label = name).
insert into document_slots (template_id, label, description, required, "order")
select ft.id, ft.name, null, true, 0
from form_templates ft
where ft.standard_key is not null
  and ft.type = 'document_upload'
  and not exists (select 1 from document_slots ds where ds.template_id = ft.id);

-- Paper checklists (« Champs à renseigner ») for medical + decharge only.
-- absence/famille/ast seed with no fields (signature-only) — valid because
-- only kind='online' requires fields to activate.
insert into form_fields (template_id, label, field_type, required, "order")
select ft.id, f.label, 'text', true, f.ord
from form_templates ft
join (values
  ('medical', 'Groupe sanguin', 0), ('medical', 'Allergies connues', 1),
  ('medical', 'Traitements en cours', 2), ('medical', 'Régime alimentaire particulier', 3),
  ('medical', 'Vaccins à jour', 4), ('medical', 'Médecin traitant', 5),
  ('medical', 'Personne à prévenir (1)', 6), ('medical', 'Personne à prévenir (2)', 7),
  ('medical', 'Autorisation de soins d''urgence', 8),
  ('decharge', 'Autorisation de participation au programme', 0),
  ('decharge', 'Décharge de responsabilité', 1),
  ('decharge', 'Autorisation de déplacement / transport', 2),
  ('decharge', 'Assurance responsabilité civile', 3),
  ('decharge', 'Signature — représentant légal 1', 4),
  ('decharge', 'Signature — représentant légal 2', 5)
) f(key, label, ord) on f.key = ft.standard_key
where not exists (select 1 from form_fields x where x.template_id = ft.id);
```

Before applying, verify the CASCADE assumption the delete relies on: `form_fields.template_id` and `document_slots.template_id` must be `ON DELETE CASCADE` (check the original schema migration or `\d form_fields` on staging). If they are not, extend the delete to remove child rows first — do not apply a failing migration.

- [ ] **Step 2: Apply to STAGING first**

```bash
set -a; source .env.staging; set +a
npx supabase db push --db-url "$STAGING_DB_URL"
```

Gotchas (see memory/runbooks): if the pooler hostname hangs under WSL2, resolve it with `getent ahostsv4` and substitute the IP in the URL. If `db push` refuses because of the known pre-existing staging ledger drift, apply directly and register the version instead:

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260715000001_external_url_standard_library_reseed.sql
psql "$STAGING_DB_URL" -c "insert into supabase_migrations.schema_migrations (version, name) values ('20260715000001', 'external_url_standard_library_reseed');"
```

Verify on staging: `psql "$STAGING_DB_URL" -c "select standard_key, kind, status from form_templates where standard_key is not null order by standard_key;"` — expect the 8 new keys as drafts per exchange (plus any surviving active old keys), and `external_url` set on `esta`.

- [ ] **Step 3: Apply to PROD via MCP**

Use MCP `apply_migration` with `name = external_url_standard_library_reseed` and `query` = the exact file contents. **Never `supabase db push` against prod.**

- [ ] **Step 4: Ledger drift check**

MCP `list_migrations`: find the stamped version for `external_url_standard_library_reseed`. If it differs from `20260715000001`, rename:

```bash
git mv supabase/migrations/20260715000001_external_url_standard_library_reseed.sql supabase/migrations/<stamped>_external_url_standard_library_reseed.sql
```

Routine check: every filename version in `supabase/migrations/` appears in `list_migrations` and vice versa.

- [ ] **Step 5: Regenerate types**

MCP `generate_typescript_types` → overwrite `types/supabase.ts` verbatim (full-file replacement). Then:

Run: `npx tsc --noEmit`
Expected: clean. (`types/db.ts` narrows the generated rows; if it errors, fix the alias in `types/db.ts` — never hand-edit `types/supabase.ts`.)

- [ ] **Step 6: Sanity-check prod data**

MCP `execute_sql` (read-only):

```sql
select standard_key, kind, status, external_url is not null as has_url
from form_templates where standard_key is not null
order by exchange_id, standard_key;
```

Expect per existing exchange: the 8 new keys as drafts (minus collisions kept active), no old-library draft keys left (`sante`, `photo`, `accueil`, `idp1`, `idp2`, `livret`, `medical2` gone unless they were active), `esta` with `has_url = true`. Also run MCP `get_advisors` (security + performance) — expect no new findings.

- [ ] **Step 7: RLS regression matrix**

Run: `pnpm test:rls` (needs the local Supabase stack or `RLS_TEST_DB_URL` — see `docs/security/rls-testing.md`). No new tables/buckets, so the matrix must pass unchanged. If neither is available locally, state so explicitly in the task report — the PR's CI rls job is then the required gate before merge.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*external_url_standard_library_reseed.sql types/supabase.ts
git commit -m "feat(db): form_templates.external_url + standard-library reseed to the real 8-item program"
```

---

### Task 6: Rework `lib/forms/standard-library.ts` to the 8-item program

New exchanges seed the same 8-item set the migration snapshotted. Templates seed **without** files (PDFs are school-specific; organizers attach their own per exchange).

**Files:**
- Rewrite: `lib/forms/standard-library.ts`
- Test: `lib/forms/__tests__/standard-library.test.ts` (rewrite)

**Interfaces:**
- Consumes: `form_templates.external_url` column (Task 5) — the insert now includes it.
- Produces: `STANDARD_TEMPLATES: StandardTemplate[]` (8 items; `StandardTemplate` gains `external_url: string | null`); `seedStandardTemplates(supabase, { exchangeId, schoolId, userId })` — signature unchanged (callers like `createExchange` are untouched).

- [ ] **Step 1: Rewrite the test file**

Replace `lib/forms/__tests__/standard-library.test.ts` entirely with:

```ts
import { describe, it, expect, vi } from 'vitest'
import { STANDARD_TEMPLATES, seedStandardTemplates } from '@/lib/forms/standard-library'

describe('STANDARD_TEMPLATES', () => {
  it('defines the 8 real-program items with unique keys', () => {
    expect(STANDARD_TEMPLATES).toHaveLength(8)
    const keys = STANDARD_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(8)
    expect(keys).toEqual([
      'medical', 'decharge', 'absence', 'famille', 'ast',
      'passeport', 'passeport-parent', 'esta',
    ])
  })
  it('has 5 pdf forms and 3 docs, all mandatory, none online', () => {
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'pdf').map(t => t.key))
      .toEqual(['medical', 'decharge', 'absence', 'famille', 'ast'])
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'doc').map(t => t.key))
      .toEqual(['passeport', 'passeport-parent', 'esta'])
    expect(STANDARD_TEMPLATES.every(t => t.audience === 'all' && t.condition_label === null)).toBe(true)
  })
  it('only esta carries an external_url', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'esta')?.external_url).toBe('https://esta.cbp.dhs.gov')
    expect(STANDARD_TEMPLATES.filter(t => t.external_url !== null)).toHaveLength(1)
  })
  it('keeps the medical and décharge checklists; other items are signature-only', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'medical')?.fields).toHaveLength(9)
    expect(STANDARD_TEMPLATES.find(t => t.key === 'decharge')?.fields).toHaveLength(6)
    for (const t of STANDARD_TEMPLATES) {
      if (!['medical', 'decharge'].includes(t.key)) expect(t.fields).toHaveLength(0)
      if (t.kind === 'doc') expect(t.fields).toHaveLength(0)
    }
  })
  it('the parent-passport description stresses the SAME parent as the AST signatory', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'passeport-parent')?.description).toMatch(/même parent/i)
  })
})

describe('seedStandardTemplates', () => {
  it('inserts 8 drafts, one slot each, fields for medical+decharge, external_url on esta', async () => {
    const templateInserts: any[] = []
    const slotInserts: any[] = []
    const fieldInserts: any[] = []
    let nextId = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'form_templates') {
          return { insert: (row: any) => ({ select: () => ({ single: async () => {
            templateInserts.push(row); return { data: { id: `t${nextId++}` }, error: null }
          } }) }) }
        }
        if (table === 'document_slots') {
          return { insert: async (rows: any) => { slotInserts.push(...[].concat(rows)); return { error: null } } }
        }
        // form_fields
        return { insert: async (rows: any) => { fieldInserts.push(...[].concat(rows)); return { error: null } } }
      }),
    }
    await seedStandardTemplates(supabase as any, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1' })
    expect(templateInserts).toHaveLength(8)
    expect(templateInserts.every(r =>
      r.status === 'draft' && r.exchange_id === 'ex1' && r.school_id === 's1'
      && r.created_by === 'u1' && r.deadline === null && r.type === 'document_upload'
    )).toBe(true)
    expect(templateInserts.find(r => r.standard_key === 'esta')?.external_url).toBe('https://esta.cbp.dhs.gov')
    expect(templateInserts.filter(r => r.external_url === null)).toHaveLength(7)
    expect(slotInserts).toHaveLength(8) // every pdf/doc template gets its slot
    expect(fieldInserts).toHaveLength(9 + 6) // medical + decharge checklists
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test lib/forms/__tests__/standard-library.test.ts`
Expected: FAIL (still the 10-item library, no `external_url`).

- [ ] **Step 3: Rewrite the library**

Replace `lib/forms/standard-library.ts` entirely with:

```ts
// Canonical standard-template library, seeded as drafts for every new
// exchange. Reworked 2026-07-15 to the real program; the SQL backfill in
// 20260715000001 is a frozen snapshot of this data for exchanges that existed
// before. Templates seed WITHOUT files — the PDFs are school-specific, so each
// school's organizer attaches their own per exchange via the UI.
import type { SupabaseClient } from '@supabase/supabase-js'

export type StandardField = { label: string; field_type: 'text' | 'checkbox' }
export type StandardTemplate = {
  key: string
  kind: 'online' | 'pdf' | 'doc'
  audience: 'all' | 'conditional'
  name: string
  description: string
  condition_label: string | null
  external_url: string | null
  fields: StandardField[]
}

const t = (label: string): StandardField => ({ label, field_type: 'text' })

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    key: 'medical', kind: 'pdf', audience: 'all', name: 'Autorisation médicale',
    condition_label: null, external_url: null,
    description: 'Autorisation de soins à télécharger, faire signer par les parents, puis redéposer signée.',
    fields: [t('Groupe sanguin'), t('Allergies connues'), t('Traitements en cours'),
      t('Régime alimentaire particulier'), t('Vaccins à jour'), t('Médecin traitant'),
      t('Personne à prévenir (1)'), t('Personne à prévenir (2)'), t('Autorisation de soins d’urgence')],
  },
  {
    key: 'decharge', kind: 'pdf', audience: 'all', name: 'Décharge de responsabilité / code de conduite',
    condition_label: null, external_url: null,
    description: 'Décharge de responsabilité et code de conduite à signer par la famille et l’élève.',
    fields: [t('Autorisation de participation au programme'), t('Décharge de responsabilité'),
      t('Autorisation de déplacement / transport'), t('Assurance responsabilité civile'),
      t('Signature — représentant légal 1'), t('Signature — représentant légal 2')],
  },
  {
    key: 'absence', kind: 'pdf', audience: 'all', name: 'Demande d’absence',
    condition_label: null, external_url: null,
    description: 'Demande d’absence au lycée pour la durée de l’échange, à faire signer puis redéposer.',
    fields: [],
  },
  {
    key: 'famille', kind: 'pdf', audience: 'all', name: 'Engagement de famille',
    condition_label: null, external_url: null,
    description: 'Engagement de la famille d’accueil, à signer puis redéposer.',
    fields: [],
  },
  {
    key: 'ast', kind: 'pdf', audience: 'all', name: 'AST — autorisation de sortie du territoire (CERFA 15646)',
    condition_label: null, external_url: null,
    description: 'Formulaire CERFA 15646 signé par un titulaire de l’autorité parentale. Téléchargez le modèle, faites-le signer, puis redéposez-le.',
    fields: [],
  },
  {
    key: 'passeport', kind: 'doc', audience: 'all', name: 'Passeport de l’élève',
    condition_label: null, external_url: null,
    description: 'Copie du passeport de l’élève en cours de validité.',
    fields: [],
  },
  {
    key: 'passeport-parent', kind: 'doc', audience: 'all', name: 'Passeport du parent signataire de l’AST',
    condition_label: null, external_url: null,
    description: 'Copie du passeport du parent qui a signé l’AST — impérativement le même parent.',
    fields: [],
  },
  {
    key: 'esta', kind: 'doc', audience: 'all', name: 'ESTA — autorisation de voyage États-Unis',
    condition_label: null, external_url: 'https://esta.cbp.dhs.gov',
    description: 'Faites la demande ESTA en ligne, puis téléversez la preuve d’autorisation obtenue.',
    fields: [],
  },
]

// Insert the whole library as drafts for a fresh exchange. Caller must be an
// organizer of `schoolId` (RLS enforces it). Drafts have no deadline and no
// assignments (the gated triggers skip them).
export async function seedStandardTemplates(
  supabase: SupabaseClient,
  opts: { exchangeId: string; schoolId: string; userId: string },
): Promise<void> {
  for (const std of STANDARD_TEMPLATES) {
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
    if (error) throw error
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
  }
}
```

(The old `c()` checkbox helper is gone — no checkbox fields remain.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/forms && npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add lib/forms/standard-library.ts lib/forms/__tests__/standard-library.test.ts
git commit -m "feat(forms): rework standard library to the real 8-item program"
```

---

### Task 7: External link — server plumbing, view-model and editor field

`TemplateVM` carries `external_url`; `getTemplatesPage` selects it; `updateTemplateMeta` accepts and validates it; `TemplateEditor` gets an optional « Lien externe » field. Any template — standard or custom — may carry a link.

**Files:**
- Modify: `lib/forms/rollup.ts` (type), `actions/forms.ts` (`getTemplatesPage`, `updateTemplateMeta`), `components/forms/TemplateEditor.tsx`
- Test: `actions/__tests__/forms-phase3.test.ts`, `components/forms/__tests__/TemplateEditor.test.tsx`, fixture updates in `components/forms/__tests__/FormsView.test.tsx` + `components/documents/__tests__/DocsView.test.tsx`

**Interfaces:**
- Consumes: `form_templates.external_url` in the regenerated types (Task 5).
- Produces:
  - `TemplateVM.external_url: string | null` (Task 8's drawers read it)
  - `updateTemplateMeta(id, meta: { name: string; description: string | null; deadline: string | null; condition_label: string | null; external_url: string | null }): Promise<TemplateActionResult>`
  - Validation rule: link must be `https://…`, ≤ 500 chars; message « Le lien externe doit être une URL https:// (500 caractères max). »

- [ ] **Step 1: Write the failing tests**

`actions/__tests__/forms-phase3.test.ts` — the existing `updateTemplateMeta` tests gain `external_url: null` in their meta argument (TypeScript forces this). Add to the `updateTemplateMeta / replaceTemplateFile` describe:

```ts
  it('updateTemplateMeta rejects a non-https external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: 'http://esta.cbp.dhs.gov',
    })
    expect(res).toEqual({ ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' })
  })
  it('updateTemplateMeta rejects an overlong external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: 'https://x.example/' + 'a'.repeat(500),
    })
    expect(res).toEqual({ ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' })
  })
  it('updateTemplateMeta persists a valid external link', async () => {
    const res = await updateTemplateMeta('tpl-1', {
      name: 'ESTA', description: null, deadline: '2026-10-10', condition_label: null,
      external_url: '  https://esta.cbp.dhs.gov  ',
    })
    expect(res).toEqual({ ok: true })
    expect(templateUpdate).toHaveBeenCalledWith(expect.objectContaining({ external_url: 'https://esta.cbp.dhs.gov' }))
  })
```

`components/forms/__tests__/TemplateEditor.test.tsx` — update the existing save assertion to include the new key:

```ts
    expect(updateMeta).toHaveBeenCalledWith('t1', {
      name: 'Accueil 2026', description: 'Composition du foyer.', deadline: '2026-10-10', condition_label: null, external_url: null,
    })
```

add `external_url: null,` to the `base` fixture object, and add:

```ts
  it('round-trips the external link field', async () => {
    render(<TemplateEditor template={{ ...base, external_url: 'https://esta.cbp.dhs.gov' }} backHref="/documents" backLabel="Retour aux documents" />)
    const input = screen.getByLabelText('Lien externe (facultatif)')
    expect(input).toHaveValue('https://esta.cbp.dhs.gov')
    fireEvent.change(input, { target: { value: 'https://example.org/demarche' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByRole('button', { name: 'Enregistrer' })
    expect(updateMeta).toHaveBeenCalledWith('t1', expect.objectContaining({ external_url: 'https://example.org/demarche' }))
  })
```

Fixture updates (TypeScript forces them): add `external_url: null,` to the `vm()` factory literal in `FormsView.test.tsx` and the `doc()` factory literal in `DocsView.test.tsx`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test actions/__tests__/forms-phase3.test.ts components/forms/__tests__/TemplateEditor.test.tsx`
Expected: FAIL (link not validated/persisted, missing input).

- [ ] **Step 3: Implement**

`lib/forms/rollup.ts` — add to `TemplateVM` (after `template_file_path`):

```ts
  external_url: string | null
```

`actions/forms.ts`:

1. `updateTemplateMeta` — new signature and validation (the `externalUrl` lines go between the deadline check and the `.update(...)`; `external_url` joins the update payload):

```ts
export async function updateTemplateMeta(
  id: string,
  meta: {
    name: string
    description: string | null
    deadline: string | null
    condition_label: string | null
    external_url: string | null
  },
): Promise<TemplateActionResult> {
  const supabase = await createClient()
  await requireUser()
  const tmpl = await getOwnedTemplate(supabase, id)
  await assertExchangeWritable(supabase, tmpl.exchange_id)

  const name = meta.name.trim()
  if (!name) return { ok: false, message: 'Le nom ne peut pas être vide.' }
  if (tmpl.status === 'active' && !meta.deadline) return { ok: false, message: 'Un modèle actif doit garder une échéance.' }
  const externalUrl = meta.external_url?.trim() || null
  if (externalUrl && (!externalUrl.startsWith('https://') || externalUrl.length > 500)) {
    return { ok: false, message: 'Le lien externe doit être une URL https:// (500 caractères max).' }
  }

  const { error } = await supabase.from('form_templates').update({
    name,
    description: meta.description?.trim() || null,
    deadline: meta.deadline || null,
    condition_label: tmpl.audience === 'conditional' ? (meta.condition_label?.trim() || null) : null,
    external_url: externalUrl,
  }).eq('id', id)
  if (error) throw error
  revalidatePath(tmpl.kind === 'doc' ? '/documents' : '/forms', 'layout')
  // Name/deadline also feed the dashboard grid and the exchange cards' %
  // complete once the template is active.
  revalidatePath('/dashboard')
  revalidatePath('/exchanges')
  return { ok: true }
}
```

2. `getTemplatesPage` — add `external_url` to the select string:

```ts
      .select('id, kind, status, audience, name, description, deadline, standard_key, condition_label, template_file_path, external_url, form_fields(label, "order")')
```

and to the VM mapping (after `template_file_path: t.template_file_path,`):

```ts
    external_url: t.external_url,
```

`components/forms/TemplateEditor.tsx` — add state (after the `conditionLabel` state):

```tsx
  const [externalUrl, setExternalUrl] = useState(template.external_url ?? '')
```

include it in the `handleSave` payload (after `condition_label: ...`):

```tsx
        external_url: externalUrl.trim() || null,
```

and add the field to the form, after the deadline/condition grid's closing `</div>` and before the `{error && ...}` line:

```tsx
        <div className="flex flex-col gap-1">
          <label htmlFor="ed-link" className="text-[13px] font-semibold text-navy">Lien externe (facultatif)</label>
          <input id="ed-link" type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)}
            placeholder="https://esta.cbp.dhs.gov" className={inputCls} />
          <p className="text-[12px] text-muted-foreground">Démarche à faire sur un site officiel — le bouton apparaît sur la page de l’élève.</p>
        </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test && npx tsc --noEmit`
Expected: full suite PASS, tsc clean (this catches every fixture the `TemplateVM` change touches).

- [ ] **Step 5: Commit**

```bash
git add lib/forms/rollup.ts actions/forms.ts components/forms/TemplateEditor.tsx actions/__tests__/forms-phase3.test.ts components/forms/__tests__/TemplateEditor.test.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx
git commit -m "feat(forms): external_url plumbing — view-model, meta action, editor field"
```

---

### Task 8: External link — student page and drawer display

Students see a prominent external-step button (label from the template name, URL printed alongside so families can verify it) above the upload form. Drawers show the link when present.

**Files:**
- Create: `components/ExternalLinkCard.tsx`
- Modify: `app/(student)/my-forms/[assignmentId]/page.tsx`, `components/forms/FormDrawer.tsx`, `components/documents/DocDrawer.tsx`
- Test: Create `components/__tests__/ExternalLinkCard.test.tsx`; extend `components/documents/__tests__/DocsView.test.tsx`

**Interfaces:**
- Consumes: `TemplateVM.external_url` (Task 7); `getAssignmentDetails` already selects `*` on `form_templates`, so `template.external_url` flows through with no action change.
- Produces: `ExternalLinkCard({ name, url }: { name: string; url: string })`.

- [ ] **Step 1: Write the failing component test**

Create `components/__tests__/ExternalLinkCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalLinkCard } from '@/components/ExternalLinkCard'

describe('ExternalLinkCard', () => {
  it('renders a new-tab noopener link labelled from the template name, with the raw URL alongside', () => {
    render(<ExternalLinkCard name="ESTA — autorisation de voyage États-Unis" url="https://esta.cbp.dhs.gov" />)
    const link = screen.getByRole('link', { name: /Faire la demande — ESTA — autorisation de voyage États-Unis/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Raw URL printed alongside so families can verify where the button goes.
    expect(screen.getByText('https://esta.cbp.dhs.gov')).toBeInTheDocument()
  })
})
```

Run: `pnpm test components/__tests__/ExternalLinkCard.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Create the component**

Create `components/ExternalLinkCard.tsx`:

```tsx
// Prominent external-step button for templates carrying a lien externe (e.g.
// the ESTA application). The raw URL is printed alongside the button so
// families can verify where it leads before clicking.
export function ExternalLinkCard({ name, url }: { name: string; url: string }) {
  return (
    <div className="mb-6 rounded-[12px] border bg-card p-4">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover"
      >
        Faire la demande — {name} <span aria-hidden="true">↗</span>
      </a>
      <p className="mt-2 break-all font-mono text-[11.5px] text-muted-foreground">{url}</p>
    </div>
  )
}
```

Run: `pnpm test components/__tests__/ExternalLinkCard.test.tsx` — Expected: PASS.

- [ ] **Step 3: Render it on the student assignment page**

In `app/(student)/my-forms/[assignmentId]/page.tsx`, add the import:

```tsx
import { ExternalLinkCard } from '@/components/ExternalLinkCard'
```

and insert **above the upload form** — directly before the `{templatePdfUrl && (` block:

```tsx
      {template.external_url && (
        <ExternalLinkCard name={template.name} url={template.external_url} />
      )}
```

- [ ] **Step 4: Show the link in both drawers, with a failing test first**

`components/documents/__tests__/DocsView.test.tsx`, add:

```ts
  it('drawer shows the external link when present', () => {
    render(<DocsView exchangeId="ex1" templates={[doc({ external_url: 'https://esta.cbp.dhs.gov' })]} studentCount={3} enrolledStudents={students} />)
    fireEvent.click(screen.getByRole('button', { name: 'Détail' }))
    const link = screen.getByRole('link', { name: /esta\.cbp\.dhs\.gov/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
```

Run it (FAIL), then in `components/documents/DocDrawer.tsx` insert after the `{vm.description && ...}` line:

```tsx
          {vm.external_url && (
            <a href={vm.external_url} target="_blank" rel="noopener noreferrer"
              className="mb-5 inline-flex items-center gap-1.5 break-all text-[13px] font-semibold text-brand underline">
              {vm.external_url} <span aria-hidden="true">↗</span>
            </a>
          )}
```

and the identical block in `components/forms/FormDrawer.tsx`, also right after its `{vm.description && ...}` line.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test components && npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add components/ExternalLinkCard.tsx components/__tests__/ExternalLinkCard.test.tsx "app/(student)/my-forms/[assignmentId]/page.tsx" components/forms/FormDrawer.tsx components/documents/DocDrawer.tsx components/documents/__tests__/DocsView.test.tsx
git commit -m "feat(student): external-link step button (ESTA pattern) + drawer link display"
```

---

### Task 9: Reference files — .docx → PDF conversion + CERFA 15646

Convert the 4 real .docx forms to PDF and fetch the official CERFA 15646 PDF, all in `docs/exampleSchoolFiles/` **in the main checkout** (`/home/bjorn/eazyexchange/docs/exampleSchoolFiles/` — the directory is untracked and only exists there, not in the worktree). These are reference files only — the app never reads them; Bjorn attaches them via the UI (that's the end-to-end verification). Guard the directory against ever being committed (real school files ≈ PII risk on any broad `git add`).

**Files:**
- Modify: `.gitignore` (in the worktree — the only committed change)
- Create (untracked, main checkout): 5 PDFs in `docs/exampleSchoolFiles/`

**Interfaces:** none — no code consumes these files.

- [ ] **Step 1: Gitignore guard**

Append to `.gitignore` in the worktree:

```
# Real school reference files (PII risk) — never commit
docs/exampleSchoolFiles/
```

```bash
git add .gitignore
git commit -m "chore: gitignore docs/exampleSchoolFiles (school files, never committed)"
```

- [ ] **Step 2: Install LibreOffice (not currently installed — verified 2026-07-15)**

```bash
sudo apt-get update && sudo apt-get install -y --no-install-recommends libreoffice-writer
```

If the session can't sudo, ask Bjorn to run it himself by typing:
`! sudo apt-get install -y --no-install-recommends libreoffice-writer`

- [ ] **Step 3: Convert the 4 .docx to PDF**

```bash
cd /home/bjorn/eazyexchange/docs/exampleSchoolFiles
soffice --headless --convert-to pdf --outdir . *.docx
```

Expected: 4 new PDFs (`Decharge de Responsabilite_Code Conduite  (3).pdf`, `Demande d'absence du Lycée  (1).pdf`, `ENGAGEMENT DE FAMILLE.pdf`, `Edina Medical Authorisation (1).pdf`) alongside the originals.

- [ ] **Step 4: Fetch the official CERFA 15646 PDF**

```bash
cd /home/bjorn/eazyexchange/docs/exampleSchoolFiles
curl -fsSL -o cerfa_15646.pdf "https://www.formulaires.service-public.fr/gf/cerfa_15646.do"
```

(URL verified 200 on 2026-07-15; it redirects to `service-public.gouv.fr` and serves the PDF. If it ever 404s, the stable entry point is https://www.service-public.fr/particuliers/vosdroits/R46121 — tell Bjorn to download manually.)

- [ ] **Step 5: Verify every file is a real PDF and under the 10 Mo upload cap**

```bash
cd /home/bjorn/eazyexchange/docs/exampleSchoolFiles
file *.pdf            # every line must say: PDF document
ls -la *.pdf          # every file < 10485760 bytes
git -C /home/bjorn/eazyexchange status --short  # the new PDFs must NOT appear staged anywhere
```

Expected: 5 PDFs, all `PDF document`, all under 10 Mo, nothing staged. (Until the branch merges, main's checkout may still list the directory as untracked — that's fine; the .gitignore commit rides the branch.)

---

### Task 10: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full gate in the worktree**

```bash
cd /home/bjorn/eazyexchange-worktrees/forms-upload-usable
pnpm lint && pnpm test && npx tsc --noEmit && pnpm build
```

Expected: all green. Note: `pnpm build` needs real-ish env values; if it fails purely on placeholder `.env.local` env (known local gotcha), then lint + tests + `npx tsc --noEmit` are the local gate and CI's build is authoritative — say so explicitly in the report rather than skipping silently.

- [ ] **Step 2: RLS matrix (migration shipped in this branch)**

```bash
pnpm test:rls
```

Expected: PASS unchanged (no new tables/buckets). Same fallback rule as Task 5 Step 7.

- [ ] **Step 3: Review the branch diff for strays**

```bash
git status --short          # must be clean, no untracked school files
git diff main --stat        # only the files this plan names
git log --oneline main..    # roughly one commit per task
```

- [ ] **Step 4: Hand off**

Do NOT push or open the PR without Bjorn's confirmation (pushing a feature branch is fine per workflow, but merging deploys prod — his call). Use superpowers:finishing-a-development-branch to present the options.

---

## Manual verification (Bjorn, after merge — Definition of Done 3 & 4)

Not automatable; listed so nothing gets lost:

1. On the real exchange, via the normal UI: attach the 5 PDFs from `docs/exampleSchoolFiles/` to `medical`, `decharge`, `absence`, `famille`, `ast`; set deadlines on all 8 items; activate all 8 — no opaque errors, hints guide the gaps.
2. As a test student: checklist shows the items, a form PDF downloads, uploads back, submits; the ESTA item shows the « Faire la demande » button and accepts the proof upload.

## Self-review notes

- Spec §1 (structured results + hints) → Tasks 1–3. §2 (library + deletable) → Tasks 6, 4. §3 (migration + reseed + post-apply) → Task 5. §4 (external link) → Tasks 7–8. §5 (files) → Task 9. Testing section → embedded per task + Task 10. DoD 1–2 → Tasks 5, 10; DoD 3–4 → manual section above.
- Type-consistency check: `TemplateActionResult`/`CreateTemplateResult`/`MSG_*` defined once in Task 1 and imported by name everywhere; `activationHints` defined in Task 3 with the exact `Pick<>` both drawers use; `updateTemplateMeta`'s `meta` gains `external_url` only in Task 7 and every earlier test that calls it is updated in the same task.
- Ordering constraint: Tasks 6–8 need the regenerated `types/supabase.ts` from Task 5 (the `external_url` inserts/selects won't compile before it). Tasks 1–4 are deliberately migration-free so they can land first.
- Deliberate small deviation from the spec's letter: row-level delete buttons in `FormsView`/`DocsView` also lose the custom-only gate (spec names only the drawers) — flagged in Task 4 with rationale.
