# Row-level « Supprimer » Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a « Supprimer » button on each forms/documents list row, next to « Modifier », for custom templates only.

**Architecture:** One shared client component (`DeleteTemplateButton`) that wraps the existing `deleteTemplate` server action behind a native `window.confirm`, then calls `router.refresh()`. It is rendered in the row button group of both `FormsView` and `DocsView`, gated on `standard_key === null`. No backend, migration, or storage work — `deleteTemplate` already performs full cleanup and refuses standard templates.

**Tech Stack:** Next.js 14 App Router (client component + server action), React, Tailwind (design tokens), Vitest + Testing Library, pnpm.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Verification before done: `pnpm lint`, `pnpm test`, `pnpm build` must pass.
- **Never log or surface student/parent PII.** The alert on failure shows only the action's generic error message — never template contents, student names, or emails.
- French UI copy. Reuse the exact confirm strings already in the drawers:
  - Forms: `Supprimer ce modèle ? Les réponses déjà envoyées par les élèves seront définitivement supprimées.`
  - Documents: `Supprimer cette pièce ? Les fichiers déjà envoyés par les familles seront définitivement supprimés.`
- Delete button visible **only** when `t.standard_key === null` (matches the drawer). Standard templates stay protected.
- Button styling (match the sibling « Modifier », danger-flavored):
  `rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-hoverrow disabled:opacity-60`

---

### Task 1: `DeleteTemplateButton` shared component

**Files:**
- Create: `components/forms/DeleteTemplateButton.tsx`
- Test: `components/forms/__tests__/DeleteTemplateButton.test.tsx`

**Interfaces:**
- Consumes: `deleteTemplate(id: string): Promise<void>` from `@/actions/forms` (already exists), `useRouter().refresh()` from `next/navigation`.
- Produces: `DeleteTemplateButton({ templateId: string, confirmText: string }): JSX.Element` — used by Task 2.

- [ ] **Step 1: Write the failing test**

Create `components/forms/__tests__/DeleteTemplateButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({ deleteTemplate: (...a: unknown[]) => del(...a) }))

import { DeleteTemplateButton } from '@/components/forms/DeleteTemplateButton'

describe('DeleteTemplateButton', () => {
  beforeEach(() => { del.mockClear(); del.mockResolvedValue(undefined); refresh.mockClear() })

  it('deletes and refreshes when the confirm is accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<DeleteTemplateButton templateId="t1" confirmText="Supprimer ?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('t1'))
    expect(refresh).toHaveBeenCalled()
  })

  it('does nothing when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeleteTemplateButton templateId="t1" confirmText="Supprimer ?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(del).not.toHaveBeenCalled()
  })

  it('alerts the generic error message when the action fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    del.mockRejectedValueOnce(new Error('Boom'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<DeleteTemplateButton templateId="t1" confirmText="Supprimer ?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Boom'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- DeleteTemplateButton`
Expected: FAIL — cannot resolve `@/components/forms/DeleteTemplateButton` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `components/forms/DeleteTemplateButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTemplate } from '@/actions/forms'

// Row-level delete for a custom template. Reuses the drawer's window.confirm
// pattern; the caller passes family-specific wording via confirmText. On
// success the parent row unmounts after refresh(), so busy is not cleared.
export function DeleteTemplateButton({
  templateId, confirmText,
}: {
  templateId: string
  confirmText: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    try {
      await deleteTemplate(templateId)
      router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={busy}
      className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-hoverrow disabled:opacity-60">
      {busy ? 'Suppression…' : 'Supprimer'}
    </button>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- DeleteTemplateButton`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/forms/DeleteTemplateButton.tsx components/forms/__tests__/DeleteTemplateButton.test.tsx
git commit -m "feat: add DeleteTemplateButton row component"
```

---

### Task 2: Wire the button into the forms & documents rows

**Files:**
- Modify: `components/forms/FormsView.tsx` (import + render after the « Modifier » link, ~line 110)
- Modify: `components/documents/DocsView.tsx` (import + render after the « Modifier » link, ~line 107)
- Test: `components/forms/__tests__/FormsView.test.tsx` (extend)
- Test: `components/documents/__tests__/DocsView.test.tsx` (extend)

**Interfaces:**
- Consumes: `DeleteTemplateButton({ templateId, confirmText })` from Task 1.

- [ ] **Step 1: Write the failing tests (forms)**

In `components/forms/__tests__/FormsView.test.tsx`, change the mock so `deleteTemplate` is a capturable spy. Replace:

```tsx
const createDraft = vi.fn().mockResolvedValue('new-id')
const activate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
```

with:

```tsx
const createDraft = vi.fn().mockResolvedValue('new-id')
const activate = vi.fn().mockResolvedValue(undefined)
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: (...a: unknown[]) => createDraft(...a),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  getTemplateFileUrl: vi.fn().mockResolvedValue('https://signed.example/x.pdf'),
}))
```

Then add these tests inside the `describe('FormsView', ...)` block (the default `vm({})` is standard — `standard_key: 'sante'`; pass `standard_key: null` for the custom case):

```tsx
it('shows Supprimer only for custom templates', () => {
  const { rerender } = renderWith(<FormsView exchangeId="ex1" templates={[vm({})]} studentCount={2} />)
  expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
  rerender(
    <ShellUiContext.Provider value={{ openNewExchange: vi.fn(), listSearch: '', setListSearch: vi.fn(), addRequestId: 0, requestAdd: vi.fn() }}>
      <FormsView exchangeId="ex1" templates={[vm({ standard_key: null })]} studentCount={2} />
    </ShellUiContext.Provider>
  )
  expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
})

it('deletes a custom template when the confirm is accepted', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderWith(<FormsView exchangeId="ex1" templates={[vm({ standard_key: null })]} studentCount={2} />)
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith('t1'))
})
```

- [ ] **Step 2: Run the forms tests to verify they fail**

Run: `pnpm test -- FormsView`
Expected: FAIL — no button with name "Supprimer" is found (button not wired into the row yet). `waitFor` on `del` times out / assertion fails.

- [ ] **Step 3: Wire the button into FormsView**

In `components/forms/FormsView.tsx`, add the import after the existing `FormDrawer` import (line 11):

```tsx
import { DeleteTemplateButton } from './DeleteTemplateButton'
```

Then, inside the row button group, insert the delete button immediately after the « Modifier » `<a>` element. Change:

```tsx
                <a href={`/forms/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
              </div>
```

to:

```tsx
                <a href={`/forms/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
                {t.standard_key === null && (
                  <DeleteTemplateButton templateId={t.id}
                    confirmText="Supprimer ce modèle ? Les réponses déjà envoyées par les élèves seront définitivement supprimées." />
                )}
              </div>
```

- [ ] **Step 4: Run the forms tests to verify they pass**

Run: `pnpm test -- FormsView`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Write the failing tests (documents)**

In `components/documents/__tests__/DocsView.test.tsx`, change the mock so `deleteTemplate` is a capturable spy. Replace:

```tsx
const activate = vi.fn().mockResolvedValue(undefined)
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue('new-id'),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
  remindTemplate: (...a: unknown[]) => remind(...a),
}))
```

with:

```tsx
const activate = vi.fn().mockResolvedValue(undefined)
const remind = vi.fn().mockResolvedValue({ reminded: 2, skipped: 1, failed: 0 })
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({
  createDraftTemplate: vi.fn().mockResolvedValue('new-id'),
  activateTemplate: (...a: unknown[]) => activate(...a),
  deleteTemplate: (...a: unknown[]) => del(...a),
  remindTemplate: (...a: unknown[]) => remind(...a),
}))
```

Also add `waitFor` to the Testing Library import on line 2:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
```

Then add these tests inside the `describe('DocsView', ...)` block (default `doc({})` is standard — `standard_key: 'passeport'`):

```tsx
it('shows Supprimer only for custom documents', () => {
  const { rerender } = render(<DocsView exchangeId="ex1" templates={[doc({})]} studentCount={3} enrolledStudents={students} />)
  expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull()
  rerender(<DocsView exchangeId="ex1" templates={[doc({ standard_key: null })]} studentCount={3} enrolledStudents={students} />)
  expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
})

it('deletes a custom document when the confirm is accepted', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<DocsView exchangeId="ex1" templates={[doc({ standard_key: null })]} studentCount={3} enrolledStudents={students} />)
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  await waitFor(() => expect(del).toHaveBeenCalledWith('d1'))
})
```

- [ ] **Step 6: Run the documents tests to verify they fail**

Run: `pnpm test -- DocsView`
Expected: FAIL — no "Supprimer" button in the row yet.

- [ ] **Step 7: Wire the button into DocsView**

In `components/documents/DocsView.tsx`, add the import after the existing `DocDrawer` import (line 11):

```tsx
import { DeleteTemplateButton } from '@/components/forms/DeleteTemplateButton'
```

Then insert the delete button immediately after the « Modifier » `<a>` element. Change:

```tsx
                <a href={`/documents/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
              </div>
```

to:

```tsx
                <a href={`/documents/${t.id}`}
                  className="rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">
                  Modifier
                </a>
                {t.standard_key === null && (
                  <DeleteTemplateButton templateId={t.id}
                    confirmText="Supprimer cette pièce ? Les fichiers déjà envoyés par les familles seront définitivement supprimés." />
                )}
              </div>
```

- [ ] **Step 8: Run the documents tests to verify they pass**

Run: `pnpm test -- DocsView`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 9: Full verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: lint clean, all tests pass, build succeeds (type-checks the new component and JSX).

- [ ] **Step 10: Commit**

```bash
git add components/forms/FormsView.tsx components/documents/DocsView.tsx components/forms/__tests__/FormsView.test.tsx components/documents/__tests__/DocsView.test.tsx
git commit -m "feat: surface Supprimer button on forms & documents rows"
```

---

## Notes for the implementer

- The `deleteTemplate` server action (`actions/forms.ts:259`) is complete: it deletes the template row (DB cascade handles assignments, submissions, fields, slots), removes families' uploaded files from the `documents` bucket and the template PDF from `form-templates`, and throws `Les modèles standard ne peuvent pas être supprimés.` for standard templates. Do not modify it.
- `standard_key` is already on `TemplateVM` — no data-layer change needed.
- The drawer « Supprimer » buttons (`FormDrawer.tsx`, `DocDrawer.tsx`) are intentionally left in place; this plan only adds the row-level shortcut.
- `text-danger-text`, `border-frame-dashed`, `bg-card`, `bg-hoverrow` are existing design tokens (used by the drawer delete and the « Aperçu » button).
