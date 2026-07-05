# Invite-via-modal on Aperçu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move student-invite from a top-banner button + `/exchanges/[id]` card into a centered CTA on the Aperçu page that opens a two-step invite modal (set deadline → reveal share link), and relocate ongoing deadline/open-close controls to the Candidatures page.

**Architecture:** UI-only change. The single existing server action `setApplicationOpen(exchangeId, open, deadline)` is reused unchanged for every mutation. `getExchanges()` already selects `*`, so the active exchange object already carries `apply_slug`, `application_open`, and `application_deadline` — no new fetch or query is needed; pages just forward these fields into their client components.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), React client components, Tailwind, shadcn/Radix `Dialog`, Vitest + @testing-library/react (jsdom).

## Global Constraints

- Package manager is **pnpm** (never npm).
- All new user-facing copy is **French**. Use curly apostrophes (`’`) in JSX text to match the codebase (e.g. `InvalidLinkState`), and straight ASCII apostrophes inside JS string literals.
- No schema migration and no new server action — reuse `setApplicationOpen(exchangeId: string, open: boolean, deadline: string | null): Promise<void>` from `actions/exchanges.ts`.
- Never log or surface student/parent PII (not relevant to these tasks, but holds).
- Verification before merge: `pnpm lint`, `pnpm test`, `pnpm build` must all pass.

---

### Task 1: Remove the invite button from the app header

**Files:**
- Modify: `components/shell/OrganizerShell.tsx:226-250`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OrganizerShell` renders **no** `+ Inviter des élèves` button in any header state. The Élèves-page header keeps only its search box.

- [ ] **Step 1: Update the failing tests**

In `components/shell/__tests__/OrganizerShell.test.tsx`:

Replace the assertion block in the test `renders the French rail items when an exchange is active` (currently lines ~44-47) — delete these lines:

```tsx
    expect(screen.getByRole('link', { name: /Inviter des élèves/ })).toHaveAttribute(
      'href',
      '/exchanges/ex1#invite'
    )
```

Replace the whole `keeps the invite button elsewhere` test with:

```tsx
  it('shows no invite button on /dashboard', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
  })
```

Replace the whole `shows the students search placeholder and invite link on /students` test with:

```tsx
  it('shows the students search placeholder and no invite button on /students', () => {
    renderShell({ pathname: '/students' })
    expect(screen.getByPlaceholderText('Rechercher un élève…')).toBeInTheDocument()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- OrganizerShell`
Expected: FAIL — the old component still renders the invite button, so `queryByText(/Inviter des élèves/)` returns a node instead of null.

- [ ] **Step 3: Remove the invite-button markup**

In `components/shell/OrganizerShell.tsx`, delete the entire default-header invite block:

```tsx
          {!isSettings && active && listPage === null && (
            <Link
              href={`/exchanges/${active.id}#invite`}
              className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
            >
              <span className="text-base leading-none">+</span> Inviter des élèves
            </Link>
          )}
```

Then, in the `listPage === 'students'` block, remove the invite `Link` so only the search input remains. Replace that whole block with:

```tsx
          {!isSettings && active && listPage === 'students' && (
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Rechercher un élève…"
              className="h-[38px] w-[220px] rounded-[9px] border bg-hoverrow px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
            />
          )}
```

If `Link` becomes unused after this change, remove its `import Link from 'next/link'` line; if any other code in the file still uses `Link`, keep the import. (Verify with a quick grep of the file for `<Link`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- OrganizerShell`
Expected: PASS (all OrganizerShell tests green).

- [ ] **Step 5: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/__tests__/OrganizerShell.test.tsx
git commit -m "refactor: remove invite button from app header"
```

---

### Task 2: InviteModal component (two-step, with exit warning)

**Files:**
- Create: `components/dashboard/InviteModal.tsx`
- Test: `components/dashboard/__tests__/InviteModal.test.tsx`

**Interfaces:**
- Consumes: `setApplicationOpen(exchangeId: string, open: boolean, deadline: string | null): Promise<void>` from `@/actions/exchanges`; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label`.
- Produces: `InviteModal({ exchangeId, applySlug, open, onOpenChange }: { exchangeId: string; applySlug: string; open: boolean; onOpenChange: (open: boolean) => void })`. When applications are opened via step 1, it calls `setApplicationOpen(exchangeId, true, deadline)`. On close it calls `onOpenChange(false)` and `router.refresh()`.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/__tests__/InviteModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }))
const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a) }))

import { InviteModal } from '@/components/dashboard/InviteModal'

function setup(onOpenChange = vi.fn()) {
  render(<InviteModal exchangeId="ex1" applySlug="france-canada" open onOpenChange={onOpenChange} />)
  return onOpenChange
}

beforeEach(() => {
  refresh.mockClear()
  setApplicationOpen.mockClear()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('InviteModal', () => {
  it('step 1 disables the open button until a deadline is chosen', () => {
    setup()
    const open = screen.getByRole('button', { name: 'Ouvrir les candidatures' })
    expect(open).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    expect(open).toBeEnabled()
  })

  it('opening applications calls setApplicationOpen and advances to the link step', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await waitFor(() =>
      expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-01')
    )
    expect(await screen.findByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
  })

  it('closing from step 1 closes immediately without warning or mutation', () => {
    const onOpenChange = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(setApplicationOpen).not.toHaveBeenCalled()
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
  })

  it('closing from the link step shows a warning, then closes and refreshes on confirm', async () => {
    const onOpenChange = setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await screen.findByDisplayValue(/\/apply\/france-canada$/)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.getByText(/Vous ne reverrez plus ce lien/)).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer quand même' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(refresh).toHaveBeenCalled()
  })

  it('cancelling the warning keeps the modal on the link step', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Date limite des candidatures'), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les candidatures' }))
    await screen.findByDisplayValue(/\/apply\/france-canada$/)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByText(/Vous ne reverrez plus ce lien/)).toBeNull()
    expect(screen.getByDisplayValue(/\/apply\/france-canada$/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- InviteModal`
Expected: FAIL with a module-not-found / `InviteModal is not defined` error (component does not exist yet).

- [ ] **Step 3: Write the component**

Create `components/dashboard/InviteModal.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setApplicationOpen } from '@/actions/exchanges'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function InviteModal({
  exchangeId,
  applySlug,
  open,
  onOpenChange,
}: {
  exchangeId: string
  applySlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [step, setStep] = useState<'deadline' | 'link'>('deadline')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [copied, setCopied] = useState(false)

  // Reset transient state each time the modal is opened.
  useEffect(() => {
    if (open) {
      setStep('deadline')
      setDeadline('')
      setSaving(false)
      setConfirmingClose(false)
      setCopied(false)
    }
  }, [open])

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function openApplications() {
    if (!deadline) return
    setSaving(true)
    try {
      await setApplicationOpen(exchangeId, true, deadline)
      setStep('link')
    } finally {
      setSaving(false)
    }
  }

  function close() {
    onOpenChange(false)
    router.refresh()
  }

  // Every close path (X, Escape, backdrop, explicit button) routes here so the
  // link step can intercept and warn before actually closing.
  function requestClose() {
    if (step === 'link' && !confirmingClose) {
      setConfirmingClose(true)
      return
    }
    close()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
    } catch {
      /* best-effort: field is selectable for manual copy */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        {step === 'deadline' ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
                Inviter vos élèves
              </DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground">
                Choisissez une date limite. Les candidatures ouvriront aussitôt.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-deadline">Date limite des candidatures</Label>
              <Input
                id="invite-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="mt-1.5 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => close()} className="text-muted-foreground">
                Annuler
              </Button>
              <Button type="button" disabled={!deadline || saving} onClick={openApplications}>
                {saving ? 'Ouverture…' : 'Ouvrir les candidatures'}
              </Button>
            </div>
          </>
        ) : confirmingClose ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
                Avez-vous copié le lien&nbsp;?
              </DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground">
                Vous ne reverrez plus ce lien. Assurez-vous de l&apos;avoir copié avant de fermer.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-1.5 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setConfirmingClose(false)} className="text-muted-foreground">
                Annuler
              </Button>
              <Button type="button" onClick={close}>
                Fermer quand même
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
                Candidatures ouvertes&nbsp;✓
              </DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground">
                Partagez ce lien avec les élèves que vous souhaitez inviter à postuler.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-link">Lien de candidature</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={applyUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-12"
                />
                <Button type="button" variant="outline" onClick={copy} className="h-12 whitespace-nowrap">
                  {copied ? 'Copié ✓' : 'Copier'}
                </Button>
              </div>
            </div>
            <div className="mt-1.5 flex justify-end">
              <Button type="button" onClick={requestClose}>
                Fermer
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- InviteModal`
Expected: PASS (all five InviteModal tests green).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/InviteModal.tsx components/dashboard/__tests__/InviteModal.test.tsx
git commit -m "feat: add two-step InviteModal with exit warning"
```

---

### Task 3: Aperçu empty-state CTA that opens the InviteModal

**Files:**
- Modify: `components/dashboard/OverviewView.tsx:25-32` (props type) and `:60-101` (render branch)
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: `InviteModal` from `@/components/dashboard/InviteModal` (Task 2).
- Produces: `OverviewView` gains three props — `applicationOpen: boolean`, `applicationDeadline: string | null`, `applySlug: string`. When `phase === 1 && !applicationOpen && applicationDeadline == null`, it renders only the empty-state CTA (button label `Inviter vos élèves à postuler`) + the mounted `InviteModal`; otherwise it renders the existing overview.

- [ ] **Step 1: Update existing tests + add empty-state tests**

In `components/dashboard/__tests__/OverviewView.test.tsx`:

Add the InviteModal-dependency mock near the top (after the existing mocks), so the empty-state render doesn't pull the real action:

```tsx
vi.mock('@/components/dashboard/InviteModal', () => ({
  InviteModal: ({ open }: { open: boolean }) => (open ? <div>invite-modal</div> : null),
}))
```

Change the `base` object so existing behavior tests hit the normal overview (add the three new props):

```tsx
const base = { exchangeId: 'ex1', apps, rollups: [], templates: [], cellMap: {}, applicationOpen: true, applicationDeadline: '2026-09-01', applySlug: 'france-canada' }
```

Append these tests inside `describe('OverviewView phase 1', ...)`:

```tsx
  it('shows the empty-state CTA when applications have never opened', () => {
    render(<OverviewView {...base} phase={1} apps={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByText(/Commencez votre échange/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ })).toBeInTheDocument()
    expect(screen.queryByText("Vue d'ensemble")).toBeNull()
  })

  it('CTA opens the invite modal', () => {
    render(<OverviewView {...base} phase={1} apps={[]} applicationOpen={false} applicationDeadline={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })

  it('shows the normal overview once applications are open, even with zero applicants', () => {
    render(<OverviewView {...base} phase={1} apps={[]} applicationOpen applicationDeadline="2026-09-01" />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.queryByText(/Commencez votre échange/)).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- OverviewView`
Expected: FAIL — `applicationOpen`/CTA are not implemented, so the empty-state tests can't find the CTA text/button (and TypeScript would flag unknown props under `pnpm build`, but the vitest run fails first on the missing UI).

- [ ] **Step 3: Add props and the empty-state branch**

In `components/dashboard/OverviewView.tsx`, extend the props type:

```tsx
export type OverviewProps = {
  exchangeId: string
  phase: 1 | 2
  apps: AppRow[]
  rollups: DossierRollup[]
  templates: TemplateInfo[]
  cellMap: CellMap
  applicationOpen: boolean
  applicationDeadline: string | null
  applySlug: string
}
```

Add the import at the top (with the other component imports):

```tsx
import { InviteModal } from '@/components/dashboard/InviteModal'
```

Destructure the new props and add modal state at the start of the component body (replace the existing `const { exchangeId, phase, apps, rollups, templates, cellMap } = props` line):

```tsx
  const { exchangeId, phase, apps, rollups, templates, cellMap, applicationOpen, applicationDeadline, applySlug } = props
  const [inviteOpen, setInviteOpen] = useState(false)
```

Immediately before the existing `const funnel = ...` line, add the empty-state early return:

```tsx
  const neverOpened = phase === 1 && !applicationOpen && applicationDeadline == null
  if (neverOpened) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-navy">
          Commencez votre échange
        </h1>
        <p className="mt-2 max-w-[420px] text-[15px] text-muted-foreground">
          Commencez votre échange en invitant vos élèves à postuler.
        </p>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="mt-6 flex h-[42px] items-center gap-1.5 rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          <span className="text-base leading-none">+</span> Inviter vos élèves à postuler
        </button>
        <InviteModal exchangeId={exchangeId} applySlug={applySlug} open={inviteOpen} onOpenChange={setInviteOpen} />
      </div>
    )
  }
```

(The heading text `Commencez votre échange` and the subline both contain the substring the test matches via `/Commencez votre échange/`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- OverviewView`
Expected: PASS (existing + three new tests green).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat: Aperçu empty-state CTA opening the invite modal"
```

---

### Task 4: Wire the dashboard page to pass the exchange's application fields

**Files:**
- Modify: `app/(organizer)/dashboard/page.tsx:26-27`

**Interfaces:**
- Consumes: `OverviewView` props `applicationOpen`, `applicationDeadline`, `applySlug` (Task 3); `active` object from `resolveActiveExchange` already carries `application_open`, `application_deadline`, `apply_slug` because `getExchanges()` selects `*`.
- Produces: a working end-to-end Aperçu → modal flow in the real app.

- [ ] **Step 1: Pass the new props**

In `app/(organizer)/dashboard/page.tsx`, replace the `return (...)` JSX with:

```tsx
  return (
    <OverviewView
      exchangeId={active.id}
      phase={(active.phase ?? 1) as 1 | 2}
      apps={apps}
      rollups={rollups}
      templates={templates}
      cellMap={grid.cellMap}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
      applySlug={active.apply_slug}
    />
  )
```

- [ ] **Step 2: Verify the type-checked build passes**

Run: `pnpm build`
Expected: PASS — no TypeScript errors. (`active` is typed `any` via `getExchanges()`, so field access compiles; `OverviewView` now receives all required props.)

- [ ] **Step 3: Commit**

```bash
git add "app/(organizer)/dashboard/page.tsx"
git commit -m "feat: feed application state into the Aperçu overview"
```

---

### Task 5: Deadline / open-close controls bar on the Candidatures page

**Files:**
- Modify: `components/applications/CandidaturesView.tsx:31` (props) and `:83-90` (header region + copy)
- Modify: `app/(organizer)/applications/page.tsx:26`
- Test: `components/applications/__tests__/CandidaturesView.test.tsx`

**Interfaces:**
- Consumes: `setApplicationOpen(exchangeId, open, deadline)` from `@/actions/exchanges`.
- Produces: `CandidaturesView` gains props `exchangeId: string`, `applicationOpen: boolean`, `applicationDeadline: string | null`. It renders an open/close toggle button and a deadline date input, both wired to `setApplicationOpen`.

- [ ] **Step 1: Update existing tests + add a controls test**

In `components/applications/__tests__/CandidaturesView.test.tsx`:

Extend the applications action mock to include `setApplicationOpen`:

```tsx
const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a) }))
```

Update every existing `render(<CandidaturesView apps={apps} exchangeName="Espagne" />)` call to pass the new props:

```tsx
render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
```

Add this test:

```tsx
  it('changing the deadline calls setApplicationOpen with the current open state', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-01' } })
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-10-01')
  })

  it('the toggle closes applications, keeping the current deadline', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: /Ouvert/ }))
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', false, '2026-09-01')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- CandidaturesView`
Expected: FAIL — `getByLabelText('Échéance')` / the toggle button don't exist yet.

- [ ] **Step 3: Add props, controls bar, and updated copy**

In `components/applications/CandidaturesView.tsx`:

Add imports at the top (alongside the existing imports):

```tsx
import { setApplicationOpen } from '@/actions/exchanges'
```

Change the component signature and add local state for the deadline (replace the current `export function CandidaturesView({ apps, exchangeName }: { apps: AppRow[]; exchangeName: string }) {` line and the `const [tab, ...]` region — insert the new state alongside the existing hooks):

```tsx
export function CandidaturesView({
  apps,
  exchangeName,
  exchangeId,
  applicationOpen,
  applicationDeadline,
}: {
  apps: AppRow[]
  exchangeName: string
  exchangeId: string
  applicationOpen: boolean
  applicationDeadline: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('all')
  const [open, setOpen] = useState(applicationOpen)
  const [deadline, setDeadline] = useState(applicationDeadline ?? '')
  const [savingState, setSavingState] = useState(false)
```

Add these two handlers next to the other handlers in the component body:

```tsx
  async function toggleOpen() {
    const next = !open
    setSavingState(true)
    try {
      await setApplicationOpen(exchangeId, next, deadline || null)
      setOpen(next)
      router.refresh()
    } finally {
      setSavingState(false)
    }
  }

  async function changeDeadline(next: string) {
    setDeadline(next)
    setSavingState(true)
    try {
      await setApplicationOpen(exchangeId, open, next || null)
      router.refresh()
    } finally {
      setSavingState(false)
    }
  }
```

Replace the intro paragraph (the `<p className="text-sm text-muted-foreground mb-5">...</p>` block) so the stale "depuis la page de l'échange" copy is gone and the controls bar is added right after the heading:

```tsx
      <p className="text-sm text-muted-foreground mb-4">
        {apps.length === 0
          ? 'Aucune candidature reçue pour le moment — partagez le lien de candidature avec vos élèves.'
          : `${apps.length} candidature${p(apps.length)} reçue${p(apps.length)} pour ${exchangeName}.`}
      </p>

      <div className="flex flex-wrap items-center gap-4 bg-card border rounded-[11px] px-4 py-2.5 mb-5">
        <button
          type="button"
          disabled={savingState}
          onClick={toggleOpen}
          className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${
            open ? 'bg-tint text-tint-text' : 'bg-subtle text-muted-foreground'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-tint-text' : 'bg-muted-foreground'}`} />
          {open ? 'Ouvert' : 'Fermé'}
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span id="candidatures-deadline-label">Échéance</span>
          <input
            aria-labelledby="candidatures-deadline-label"
            type="date"
            value={deadline}
            disabled={savingState}
            onChange={(e) => changeDeadline(e.target.value)}
            className="h-[34px] rounded-[8px] border px-2.5 text-[13px]"
          />
        </label>
      </div>
```

(The `aria-labelledby` pointing at the `Échéance` span is what makes `getByLabelText('Échéance')` resolve to the date input in the test.)

- [ ] **Step 4: Pass the props from the page**

In `app/(organizer)/applications/page.tsx`, replace the final `return <CandidaturesView ... />` line with:

```tsx
  return (
    <CandidaturesView
      apps={apps}
      exchangeName={active.name}
      exchangeId={active.id}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
    />
  )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- CandidaturesView`
Expected: PASS (existing + two new tests green).

- [ ] **Step 6: Commit**

```bash
git add components/applications/CandidaturesView.tsx "app/(organizer)/applications/page.tsx" components/applications/__tests__/CandidaturesView.test.tsx
git commit -m "feat: deadline & open-close controls on the Candidatures page"
```

---

### Task 6: Retire ApplicationsCard and slim the exchange detail page

**Files:**
- Modify: `app/(organizer)/exchanges/[id]/page.tsx` (full rewrite to a stub)
- Delete: `components/ApplicationsCard.tsx`

**Interfaces:**
- Consumes: `getExchange` from `@/actions/exchanges` (existing).
- Produces: `/exchanges/[id]` renders a minimal header only; no invite controls; `#invite` anchor removed. `ApplicationsCard` no longer exists.

- [ ] **Step 1: Confirm ApplicationsCard has no other consumers**

Run: `grep -rn "ApplicationsCard" app components --include=*.tsx --include=*.ts`
Expected: only `app/(organizer)/exchanges/[id]/page.tsx` and `components/ApplicationsCard.tsx` (which we are removing). If any other file references it, stop and reconcile before deleting.

- [ ] **Step 2: Rewrite the exchange page as a stub**

Replace the entire contents of `app/(organizer)/exchanges/[id]/page.tsx` with:

```tsx
import { getExchange } from '@/actions/exchanges'

// Invite + application controls now live on the Aperçu CTA/modal and the
// Candidatures page. This route stays as a lightweight exchange header.
export default async function ExchangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const exchange = await getExchange(id)

  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">
        {exchange.school_a?.name} ↔ {exchange.school_b?.name} · {exchange.year}
      </p>
      <h1 className="font-display text-2xl font-semibold">{exchange.name}</h1>
    </div>
  )
}
```

- [ ] **Step 3: Delete the card component**

Run:

```bash
git rm components/ApplicationsCard.tsx
```

- [ ] **Step 4: Verify the full gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all PASS — no remaining import of `ApplicationsCard`, no type errors, all tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(organizer)/exchanges/[id]/page.tsx"
git commit -m "refactor: retire ApplicationsCard, slim exchange detail page"
```

---

## Final verification (before merge)

Run the full gate one more time from a clean state:

```bash
pnpm lint
pnpm test
pnpm build
```

All three must pass. Then follow the git workflow in `CLAUDE.md` (feature branch → user confirmation before merging to `main`, since this is a multi-file feature).

## Self-review notes (author)

- **Spec coverage:** banner removal → Task 1; two-step modal + exit warning → Task 2; Aperçu empty-state CTA + gate `!application_open && application_deadline == null` → Tasks 3-4; Candidatures controls bar + updated copy → Task 5; retire `ApplicationsCard` + `/exchanges/[id]` stub → Task 6; "no schema change / reuse `setApplicationOpen`" honored throughout; "shown once via sole CTA entry point, no persisted flag" realized by the CTA disappearing after open (Tasks 3-4).
- **Type consistency:** `setApplicationOpen(exchangeId, open, deadline)` used identically in Tasks 2 & 5; new props `applicationOpen`/`applicationDeadline`/`applySlug` (OverviewView) and `exchangeId`/`applicationOpen`/`applicationDeadline` (CandidaturesView) match their page wiring in Tasks 4 & 5.
- **Accepted tradeoff (from spec):** no in-app link recovery after the modal closes; the exit warning is the only guard.
```
