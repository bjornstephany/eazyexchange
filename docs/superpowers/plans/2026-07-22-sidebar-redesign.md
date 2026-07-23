# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the organizer shell's 82px dark icon rail with a 250px light, labelled sidebar that lists the organizer's exchanges inline, and move exchange switching out of the header dropdown into that list.

**Architecture:** Pure presentation change. No server actions, no schema, no migration. `OrganizerShell.tsx` stays a composition root; three new client modules carry the new behaviour (`lib/shell/exchange-color.ts`, `components/shell/useSidebarCollapsed.ts`, `components/shell/SidebarNav.tsx`, `components/shell/ExchangeList.tsx`). `SessionSelector.tsx` is deleted — its `setActiveExchange` + navigate logic moves into `ExchangeList`. The contextual top-bar search leaves `ShellUiContext` and becomes local state on the Élèves page.

**Tech Stack:** Next.js 14 App Router, React client components, next-intl, Tailwind, vitest + @testing-library/react (jsdom).

## Global Constraints

- **Branch / worktree:** `feature/sidebar-redesign`, worktree `.claude/worktrees/feature+sidebar-redesign`, dev port `3347`. Run every command from the worktree root. Never `cd` to the main checkout.
- **Confirm the branch before every commit:** `git branch --show-current` must print `feature/sidebar-redesign`.
- **Never `git add -A` / `git add .`** — stage only the files named in the task.
- **No migration.** `supabase/migrations/` must not be touched, so `pnpm test:rls` is not required.
- **i18n:** every new or changed key ships in all five locales (`fr`, `en`, `es`, `de`, `it`). Edits to `messages/*.json` are restricted to the `organizer.shell` subtree — a sibling worktree (`feature/i18n-phase3-student-apply`) is editing the same files.
- **French copy uses typographic apostrophes (`’`), never `'`.** None of the new strings in this plan contain an apostrophe; keep it that way.
- **Palette (verbatim, do not re-pick):** `['#7C3AED','#2456E6','#14B8C4','#F59E0B','#F43F5E','#22A06B','#4F46E5','#EA7317']`
- **Sidebar widths:** 250px expanded, 68px collapsed. Header height stays 66px.
- **localStorage key:** `ee.sidebar.collapsed`. First-visit auto-collapse threshold: `window.innerWidth < 1100`.
- **jsdom default `window.innerWidth` is 1024**, which is below the auto-collapse threshold. Every shell test must set `window.innerWidth = 1440` and clear `localStorage` in `beforeEach`, or the sidebar renders collapsed and label assertions fail.
- **Running tests:** `pnpm test` (vitest.config.ts already excludes `**/.claude/**`). A single file: `pnpm vitest run <path>`.
- **Non-goals — do not build:** per-exchange `···` overflow menu, an `exchanges.color` column or colour picker, progress subtitles in the sidebar, any change to the student-facing shell.

---

### Task 1: Deterministic exchange dot colour

**Files:**
- Create: `lib/shell/exchange-color.ts`
- Test: `lib/shell/__tests__/exchange-color.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const PALETTE: readonly string[]` — the 8 hex strings above.
  - `export function exchangeDotColor(id: string): string` — returns a member of `PALETTE`, deterministic per `id`.

- [ ] **Step 1: Write the failing test**

Create `lib/shell/__tests__/exchange-color.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { exchangeDotColor, PALETTE } from '@/lib/shell/exchange-color'

const IDS = [
  '2f1c9a3e-7b64-4c21-9d0a-88ef1234ab01',
  '9d0a88ef-1234-4ab0-8f1c-2f1c9a3e7b64',
  'c3d4e5f6-a7b8-49c0-b1d2-e3f4a5b60718',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'ex1',
  'ex2',
  'ex3',
]

describe('exchangeDotColor', () => {
  it('is stable for the same id', () => {
    for (const id of IDS) {
      expect(exchangeDotColor(id)).toBe(exchangeDotColor(id))
    }
  })

  it('always returns a palette member', () => {
    for (const id of IDS) {
      expect(PALETTE).toContain(exchangeDotColor(id))
    }
  })

  it('spreads across more than one palette entry', () => {
    const distinct = new Set(IDS.map(exchangeDotColor))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('handles the empty string without throwing', () => {
    expect(PALETTE).toContain(exchangeDotColor(''))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/shell/__tests__/exchange-color.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/shell/exchange-color"`.

- [ ] **Step 3: Write the implementation**

Create `lib/shell/exchange-color.ts`:

```ts
// Deterministic sidebar dot colour for an exchange. Derived from the row id, so
// it needs no `color` column, no backfill and no migration — which also keeps
// this change out of the single-writer `supabase/migrations/` queue.
export const PALETTE = [
  '#7C3AED', '#2456E6', '#14B8C4', '#F59E0B',
  '#F43F5E', '#22A06B', '#4F46E5', '#EA7317',
] as const

export function exchangeDotColor(id: string): string {
  // djb2-ish: multiply-and-add over char codes, kept in uint32 range.
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h * 33) ^ id.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]!
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/shell/__tests__/exchange-color.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feature/sidebar-redesign
git add lib/shell/exchange-color.ts lib/shell/__tests__/exchange-color.test.ts
git commit -m "feat(shell): deterministic exchange dot colour from row id"
```

---

### Task 2: Copy, i18n keys and the `brand.soft` token

**Files:**
- Modify: `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/de.json`, `messages/it.json` — the `organizer.shell` subtree only
- Modify: `tailwind.config.ts:70`
- Test: `messages/__tests__/parity.test.ts` (existing — must keep passing)

**Interfaces:**
- Consumes: nothing.
- Produces, under `organizer.shell`:
  - `nav.applications`, `nav.files`, `nav.communication` — de-abbreviated
  - `exchangeGroup.title`, `exchangeGroup.add`, `exchangeGroup.empty`
  - `sidebar.collapse`, `sidebar.expand`
  - Tailwind class `bg-brand-soft` → `#EDF2FE`

- [ ] **Step 1: Write the failing test**

Add to the end of `messages/__tests__/parity.test.ts`, inside the existing
`describe('message catalog parity', …)` block (just before its closing `})`):

```ts
  it('the organizer sidebar keys exist and are not abbreviated', () => {
    const fl = leaves(fr)
    expect(fl['organizer.shell.nav.applications']).toBe('Candidatures')
    expect(fl['organizer.shell.nav.files']).toBe('Fichiers')
    expect(fl['organizer.shell.nav.communication']).toBe('Communication')
    expect(fl['organizer.shell.exchangeGroup.title']).toBe('Mes échanges')
    expect(fl['organizer.shell.exchangeGroup.add']).toBe('+ Ajouter')
    expect(fl['organizer.shell.exchangeGroup.empty']).toBe('Aucun échange')
    expect(fl['organizer.shell.sidebar.collapse']).toBe('Réduire')
    expect(fl['organizer.shell.sidebar.expand']).toBe('Développer')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: FAIL — `expected 'Candid.' to be 'Candidatures'`.

- [ ] **Step 3: Update the five catalogs**

In each file, replace the three `organizer.shell.nav` values and add two new
sibling objects `exchangeGroup` and `sidebar` inside `organizer.shell`
(alongside the existing `archivedBadge` / `studentSearch`). Leave
`studentSearch.placeholder` in place — Task 3 still uses it, from the Élèves
page.

`messages/fr.json` → `organizer.shell`:

```json
      "nav": {
        "dashboard": "Aperçu",
        "applications": "Candidatures",
        "files": "Fichiers",
        "students": "Élèves",
        "feedback": "Feedback",
        "communication": "Communication"
      },
      "exchangeGroup": {
        "title": "Mes échanges",
        "add": "+ Ajouter",
        "empty": "Aucun échange"
      },
      "sidebar": {
        "collapse": "Réduire",
        "expand": "Développer"
      },
```

`messages/en.json`:

```json
      "nav": {
        "dashboard": "Overview",
        "applications": "Applications",
        "files": "Files",
        "students": "Students",
        "feedback": "Feedback",
        "communication": "Communication"
      },
      "exchangeGroup": {
        "title": "My exchanges",
        "add": "+ Add",
        "empty": "No exchanges"
      },
      "sidebar": {
        "collapse": "Collapse",
        "expand": "Expand"
      },
```

`messages/es.json`:

```json
      "nav": {
        "dashboard": "Resumen",
        "applications": "Candidaturas",
        "files": "Archivos",
        "students": "Alumnos",
        "feedback": "Comentarios",
        "communication": "Comunicación"
      },
      "exchangeGroup": {
        "title": "Mis intercambios",
        "add": "+ Añadir",
        "empty": "Ningún intercambio"
      },
      "sidebar": {
        "collapse": "Contraer",
        "expand": "Expandir"
      },
```

`messages/de.json`:

```json
      "nav": {
        "dashboard": "Übersicht",
        "applications": "Bewerbungen",
        "files": "Dateien",
        "students": "Schüler",
        "feedback": "Feedback",
        "communication": "Kommunikation"
      },
      "exchangeGroup": {
        "title": "Meine Austausche",
        "add": "+ Hinzufügen",
        "empty": "Kein Austausch"
      },
      "sidebar": {
        "collapse": "Einklappen",
        "expand": "Ausklappen"
      },
```

`messages/it.json`:

```json
      "nav": {
        "dashboard": "Panoramica",
        "applications": "Candidature",
        "files": "File",
        "students": "Studenti",
        "feedback": "Feedback",
        "communication": "Comunicazione"
      },
      "exchangeGroup": {
        "title": "I miei scambi",
        "add": "+ Aggiungi",
        "empty": "Nessuno scambio"
      },
      "sidebar": {
        "collapse": "Riduci",
        "expand": "Espandi"
      },
```

- [ ] **Step 4: Add the `brand.soft` token**

In `tailwind.config.ts`, change the `brand` entry (line 70) from:

```ts
        brand: { DEFAULT: "#2456E6", hover: "#1D48C7", accent: "#3B6EF6" },
```

to:

```ts
        brand: { DEFAULT: "#2456E6", hover: "#1D48C7", accent: "#3B6EF6", soft: "#EDF2FE" },
```

Leave the `rail` token defined — removing it is out of scope.

- [ ] **Step 5: Run the parity suite to verify it passes**

Run: `pnpm vitest run messages/__tests__/parity.test.ts`
Expected: PASS — all locales share the fr key set, no empty values, the new assertions pass.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add messages/fr.json messages/en.json messages/es.json messages/de.json messages/it.json \
        messages/__tests__/parity.test.ts tailwind.config.ts
git commit -m "i18n(shell): de-abbreviate nav labels, add sidebar keys and brand.soft"
```

> Note: the OrganizerShell / RailPrefetch suites still assert the old
> abbreviations and will now fail. Task 6 fixes them. Do not "fix" them here.

---

### Task 3: Move the contextual search from the shell to the Élèves page

**Files:**
- Modify: `components/shell/ShellUiContext.tsx`
- Modify: `components/shell/OrganizerShell.tsx` (remove `listSearch` state, the pathname-reset effect, and the header search `<input>`)
- Modify: `components/students/StudentsView.tsx`
- Test: `components/students/__tests__/StudentsView.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ShellUi` narrows to `{ openNewExchange: () => void }`. `useShellUi()` no longer exposes `listSearch` / `setListSearch`.

- [ ] **Step 1: Rewrite the StudentsView search test**

In `components/students/__tests__/StudentsView.test.tsx`:

Delete lines 5–10 (the `listSearch` let and the `ShellUiContext` mock) entirely.

Change the `beforeEach` (line 45) from `beforeEach(() => { listSearch = ''; remind.mockClear() })` to:

```ts
  beforeEach(() => { remind.mockClear() })
```

Replace the whole `'search filters accent-insensitively via the shell field'` test (lines 62–67) with:

```ts
  it('search filters accent-insensitively via the page toolbar field', () => {
    renderWithIntl(<StudentsView exchangeId="ex1" students={[second, base]} />)
    fireEvent.change(screen.getByPlaceholderText('Rechercher un élève…'), {
      target: { value: 'yanis' },
    })
    expect(screen.queryAllByText('Camille Laurent')).toHaveLength(0)
    expect(screen.getAllByText('Yanis Benali').length).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run components/students/__tests__/StudentsView.test.tsx`
Expected: FAIL — `Unable to find an element with the placeholder text of: Rechercher un élève…`.

- [ ] **Step 3: Give StudentsView its own search input**

In `components/students/StudentsView.tsx`:

Delete the import on line 4 (`import { useShellUi } from '@/components/shell/ShellUiContext'`).

Replace line 14 (`const { listSearch } = useShellUi()`) with:

```tsx
  const [listSearch, setListSearch] = useState('')
```

Then insert the input between the title block and the chips row — i.e. after the
`</div>` that closes the `mb-[13px]` heading block (line 30) and before the
`<div className="mb-[13px] flex flex-wrap gap-1.5">` chips row:

```tsx
          <div className="mb-[13px]">
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder={t('shell.studentSearch.placeholder')}
              className="h-[38px] w-full rounded-[9px] border bg-card px-3.5 text-[13px] placeholder:text-placeholder focus:border-brand focus:outline-none"
            />
          </div>
```

`t` is already `useTranslations('organizer')`, so `t('shell.studentSearch.placeholder')` resolves.

- [ ] **Step 4: Narrow ShellUiContext**

Replace `components/shell/ShellUiContext.tsx` in full:

```tsx
'use client'
import { createContext, useContext } from 'react'

export type ShellUi = {
  openNewExchange: () => void
}

export const ShellUiContext = createContext<ShellUi>({
  openNewExchange: () => {},
})

export const useShellUi = () => useContext(ShellUiContext)
```

- [ ] **Step 5: Strip the search out of OrganizerShell**

In `components/shell/OrganizerShell.tsx`:

Delete line 96 (`const [listSearch, setListSearch] = useState('')`) and lines 98–99
(the comment plus `useEffect(() => { setListSearch('') }, [pathname])`).

Delete line 101 (`const isStudents = pathname.startsWith('/students')`).

Replace the `shellUi` memo (lines 115–119) with:

```tsx
  const shellUi = useMemo<ShellUi>(() => ({
    openNewExchange: handleNewExchange,
  }), [handleNewExchange])
```

Delete the header search block (lines 235–243):

```tsx
            {!isSettings && active && isStudents && (
              <input
                type="search"
                value={listSearch}
                …
              />
            )}
```

- [ ] **Step 6: Run the students suite and typecheck**

Run: `pnpm vitest run components/students/__tests__/StudentsView.test.tsx`
Expected: PASS — 9 tests.

Run: `npx tsc --noEmit`
Expected: no errors. (If `useState` became unused in `OrganizerShell.tsx`, it did not — `menuOpen`, `newExchangeOpen` and `feedbackOpen` still use it.)

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add components/shell/ShellUiContext.tsx components/shell/OrganizerShell.tsx \
        components/students/StudentsView.tsx components/students/__tests__/StudentsView.test.tsx
git commit -m "refactor(students): own the search input instead of the shell header"
```

---

### Task 4: `useSidebarCollapsed` hook

**Files:**
- Create: `components/shell/useSidebarCollapsed.ts`
- Test: `components/shell/__tests__/useSidebarCollapsed.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void }`.
  Server render is always `collapsed: false`; the stored value (or the
  `innerWidth < 1100` first-visit default) is applied in an effect, so there is
  no hydration mismatch.

- [ ] **Step 1: Write the failing test**

Create `components/shell/__tests__/useSidebarCollapsed.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useSidebarCollapsed } from '@/components/shell/useSidebarCollapsed'

function Probe() {
  const { collapsed, toggle } = useSidebarCollapsed()
  return (
    <button type="button" onClick={toggle}>
      {collapsed ? 'collapsed' : 'expanded'}
    </button>
  )
}

function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}

describe('useSidebarCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setWidth(1440)
  })

  it('defaults to expanded on a wide viewport with no stored value', () => {
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('expanded')
  })

  it('defaults to collapsed on a narrow viewport with no stored value', () => {
    setWidth(1000)
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('collapsed')
  })

  it('a stored "true" wins over a wide viewport', () => {
    window.localStorage.setItem('ee.sidebar.collapsed', 'true')
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('collapsed')
  })

  it('a stored "false" wins over a narrow viewport', () => {
    setWidth(900)
    window.localStorage.setItem('ee.sidebar.collapsed', 'false')
    render(<Probe />)
    expect(screen.getByRole('button')).toHaveTextContent('expanded')
  })

  it('toggle flips the value and persists it', () => {
    render(<Probe />)
    act(() => { fireEvent.click(screen.getByRole('button')) })
    expect(screen.getByRole('button')).toHaveTextContent('collapsed')
    expect(window.localStorage.getItem('ee.sidebar.collapsed')).toBe('true')
    act(() => { fireEvent.click(screen.getByRole('button')) })
    expect(screen.getByRole('button')).toHaveTextContent('expanded')
    expect(window.localStorage.getItem('ee.sidebar.collapsed')).toBe('false')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run components/shell/__tests__/useSidebarCollapsed.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/shell/useSidebarCollapsed"`.

- [ ] **Step 3: Write the hook**

Create `components/shell/useSidebarCollapsed.ts`:

```ts
'use client'
import { useCallback, useEffect, useState } from 'react'

const KEY = 'ee.sidebar.collapsed'
// Below this viewport width a first-time visitor gets the collapsed sidebar.
const AUTO_COLLAPSE_BELOW = 1100

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    // Safari private mode / storage disabled — behave like a first visit.
    return null
  }
}

export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
  // The server always renders expanded; the stored preference is applied in an
  // effect so the markup matches on hydration. The width change is a CSS
  // transition, not a layout jump.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = read()
    if (stored === 'true') setCollapsed(true)
    else if (stored === 'false') setCollapsed(false)
    else if (window.innerWidth < AUTO_COLLAPSE_BELOW) setCollapsed(true)
  }, [])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(KEY, String(next))
      } catch {
        // Preference simply does not persist; the session still toggles.
      }
      return next
    })
  }, [])

  return { collapsed, toggle }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run components/shell/__tests__/useSidebarCollapsed.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add components/shell/useSidebarCollapsed.ts components/shell/__tests__/useSidebarCollapsed.test.tsx
git commit -m "feat(shell): persisted sidebar collapse preference hook"
```

---

### Task 5: `SidebarNav` and `ExchangeList` components

**Files:**
- Create: `components/shell/SidebarNav.tsx`
- Create: `components/shell/ExchangeList.tsx`
- Test: `components/shell/__tests__/SidebarNav.test.tsx`
- Test: `components/shell/__tests__/ExchangeList.test.tsx`

**Interfaces:**
- Consumes: `exchangeDotColor` from Task 1; `organizer.shell.exchangeGroup.*` and `organizer.shell.archivedBadge` from Task 2.
- Produces:
  ```ts
  export type SidebarNavItem = {
    href: string
    label: string
    active: boolean
    icon: React.ReactNode
  }
  export function SidebarNav(props: { items: SidebarNavItem[]; collapsed: boolean }): JSX.Element

  export function ExchangeList(props: {
    exchanges: ExchangeOption[]     // from './OrganizerShell'
    activeId: string | null
    collapsed: boolean
    onNewExchange: () => void
  }): JSX.Element
  ```
  `ExchangeList` imports `ExchangeOption` as a **type-only** import from
  `./OrganizerShell` — same pattern the deleted `SessionSelector` used; a
  type-only cycle is erased at compile time and is safe.

- [ ] **Step 1: Write the failing SidebarNav test**

Create `components/shell/__tests__/SidebarNav.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import { SidebarNav, type SidebarNavItem } from '@/components/shell/SidebarNav'

const items: SidebarNavItem[] = [
  { href: '/dashboard', label: 'Aperçu', active: true, icon: <span data-testid="i1" /> },
  { href: '/applications', label: 'Candidatures', active: false, icon: <span data-testid="i2" /> },
]

describe('SidebarNav', () => {
  it('renders labelled, prefetching links and marks the active one', () => {
    renderWithIntl(<SidebarNav items={items} collapsed={false} />)
    expect(screen.getByRole('link', { name: 'Candidatures' })).toHaveAttribute('href', '/applications')
    expect(screen.getByRole('link', { name: 'Aperçu' })).toHaveClass('bg-brand-soft')
    expect(screen.getByRole('link', { name: 'Candidatures' })).not.toHaveClass('bg-brand-soft')
  })

  it('collapsed: no visible text, accessible names preserved', () => {
    renderWithIntl(<SidebarNav items={items} collapsed />)
    expect(screen.queryByText('Candidatures')).toBeNull()
    const link = screen.getByRole('link', { name: 'Candidatures' })
    expect(link).toHaveAttribute('title', 'Candidatures')
    expect(screen.getByTestId('i2')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run components/shell/__tests__/SidebarNav.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/shell/SidebarNav"`.

- [ ] **Step 3: Write SidebarNav**

Create `components/shell/SidebarNav.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type SidebarNavItem = {
  href: string
  label: string
  active: boolean
  icon: React.ReactNode
}

export function SidebarNav({
  items,
  collapsed,
}: {
  items: SidebarNavItem[]
  collapsed: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-3' : 'px-3')}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={true}
          // Collapsed rows have no text, so the accessible name comes from
          // title/aria-label instead.
          title={collapsed ? item.label : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={cn(
            'flex items-center rounded-[10px] text-[13.5px]',
            collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5',
            item.active
              ? 'bg-brand-soft font-semibold text-brand'
              : 'text-muted-foreground hover:bg-hoverrow hover:text-foreground',
          )}
        >
          <span className="flex h-[18px] w-[18px] flex-none items-center justify-center">
            {item.icon}
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run components/shell/__tests__/SidebarNav.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Write the failing ExchangeList test**

Create `components/shell/__tests__/ExchangeList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

let mockPathname = '/students'
const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))
const setActive = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/session', () => ({ setActiveExchange: (id: string) => setActive(id) }))

import { ExchangeList } from '@/components/shell/ExchangeList'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: true },
]

describe('ExchangeList', () => {
  beforeEach(() => {
    push.mockClear()
    setActive.mockClear()
    mockPathname = '/students'
  })

  it('lists every exchange with the group header and the add pill', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Mes échanges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /France–Canada 2026/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Espagne 2026/ })).toBeInTheDocument()
  })

  it('renders the Archivé pill for an archived row', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    const row = screen.getByRole('button', { name: /Espagne 2026/ })
    expect(row).toHaveTextContent('Archivé')
  })

  it('clicking an inactive row switches and navigates to /dashboard', async () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('does not navigate when already on /dashboard', async () => {
    mockPathname = '/dashboard'
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Espagne 2026/ }))
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('ex2'))
    expect(push).not.toHaveBeenCalled()
  })

  it('clicking the active row is a no-op', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(setActive).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('the add pill calls onNewExchange', () => {
    const onNewExchange = vi.fn()
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed={false} onNewExchange={onNewExchange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Ajouter' }))
    expect(onNewExchange).toHaveBeenCalled()
  })

  it('shows the empty state with zero exchanges', () => {
    renderWithIntl(
      <ExchangeList exchanges={[]} activeId={null} collapsed={false} onNewExchange={() => {}} />,
    )
    expect(screen.getByText('Aucun échange')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('collapsed: dots only, names survive as accessible titles', () => {
    renderWithIntl(
      <ExchangeList exchanges={exchanges} activeId="ex1" collapsed onNewExchange={() => {}} />,
    )
    expect(screen.queryByText('Mes échanges')).toBeNull()
    expect(screen.queryByText('France–Canada 2026')).toBeNull()
    expect(screen.getByRole('button', { name: 'France–Canada 2026' }))
      .toHaveAttribute('title', 'France–Canada 2026')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run components/shell/__tests__/ExchangeList.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/shell/ExchangeList"`.

- [ ] **Step 7: Write ExchangeList**

Create `components/shell/ExchangeList.tsx`:

```tsx
'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setActiveExchange } from '@/actions/session'
import { exchangeDotColor } from '@/lib/shell/exchange-color'
import { cn } from '@/lib/utils'
import type { ExchangeOption } from './OrganizerShell'

export function ExchangeList({
  exchanges,
  activeId,
  collapsed,
  onNewExchange,
}: {
  exchanges: ExchangeOption[]
  activeId: string | null
  collapsed: boolean
  onNewExchange: () => void
}) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const pathname = usePathname()

  async function select(id: string) {
    if (id === activeId) return
    // setActiveExchange revalidates the whole tree; the action response already
    // re-renders the current page, so only navigate if we are not on it.
    await setActiveExchange(id)
    if (pathname !== '/dashboard') router.push('/dashboard')
  }

  return (
    <div className="border-t pt-3.5">
      <div
        className={cn(
          'flex items-center px-3',
          collapsed ? 'justify-center' : 'justify-between pl-6 pr-3',
        )}
      >
        {!collapsed && (
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[.08em] text-tertiary">
            {t('shell.exchangeGroup.title')}
          </span>
        )}
        <button
          type="button"
          onClick={onNewExchange}
          title={collapsed ? t('shell.exchangeGroup.add') : undefined}
          aria-label={t('shell.exchangeGroup.add')}
          className={cn(
            'rounded-pill text-[11.5px] font-semibold text-brand hover:bg-brand-soft',
            collapsed ? 'flex h-7 w-7 items-center justify-center text-base' : 'px-2.5 py-1',
          )}
        >
          {collapsed ? '+' : t('shell.exchangeGroup.add')}
        </button>
      </div>

      <div className={cn('mt-1.5 flex flex-col gap-0.5 px-3', collapsed && 'items-center')}>
        {exchanges.length === 0 && !collapsed && (
          <p className="px-3 py-2 text-[12.5px] text-tertiary">
            {t('shell.exchangeGroup.empty')}
          </p>
        )}
        {exchanges.map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => select(ex.id)}
            title={collapsed ? ex.name : undefined}
            aria-label={collapsed ? ex.name : undefined}
            aria-current={ex.id === activeId ? 'true' : undefined}
            className={cn(
              'flex items-center rounded-[10px] text-[13px]',
              collapsed ? 'h-10 w-10 justify-center' : 'w-full gap-2.5 px-3 py-2 text-left',
              ex.id === activeId
                ? 'bg-subtle font-semibold text-foreground'
                : 'text-muted-foreground hover:bg-hoverrow hover:text-foreground',
            )}
          >
            <span
              aria-hidden
              className="h-[9px] w-[9px] flex-none rounded-full"
              style={{ background: exchangeDotColor(ex.id) }}
            />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{ex.name}</span>}
            {!collapsed && ex.archived && (
              <span className="flex-none rounded-pill bg-subtle px-2 py-px font-mono text-[10px] font-semibold text-muted-foreground">
                {t('shell.archivedBadge')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm vitest run components/shell/__tests__/ExchangeList.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add components/shell/SidebarNav.tsx components/shell/ExchangeList.tsx \
        components/shell/__tests__/SidebarNav.test.tsx components/shell/__tests__/ExchangeList.test.tsx
git commit -m "feat(shell): sidebar nav and inline exchange list components"
```

---

### Task 6: Rewire `OrganizerShell`, delete `SessionSelector`

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`
- Delete: `components/shell/SessionSelector.tsx`
- Delete: `components/shell/__tests__/SessionSelector.test.tsx`
- Test: `components/shell/__tests__/OrganizerShell.test.tsx` (rewritten)
- Test: `components/shell/__tests__/RailPrefetch.test.tsx` (labels updated)

**Interfaces:**
- Consumes: `useSidebarCollapsed` (Task 4), `SidebarNav` + `SidebarNavItem` + `ExchangeList` (Task 5), the new i18n keys and `bg-brand-soft` (Task 2).
- Produces: `ExchangeOption` stays exported from this file unchanged.

- [ ] **Step 1: Update the OrganizerShell test file**

Apply all of the following to `components/shell/__tests__/OrganizerShell.test.tsx`.

(a) Add `beforeEach` to the imports on line 1 and a suite-level `beforeEach`
immediately after `describe('OrganizerShell', () => {` (line 41). jsdom's
default `innerWidth` is 1024, below the 1100 auto-collapse threshold — without
this, every label assertion fails:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
```

```ts
describe('OrganizerShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  })
```

(b) Replace the abbreviated labels. In `'renders the French rail items when an exchange is active'`, `'only Aperçu stays with zero exchanges'` and `'hides Candid. but offers creation when no exchanges exist'`, change every `'Candid.'` to `'Candidatures'`. Rename that last test to `'hides Candidatures but offers creation when no exchanges exist'`.

(c) `'rail points at the session-scoped top-level routes'` — the assertion becomes:

```ts
    expect(screen.getByRole('link', { name: 'Candidatures' })).toHaveAttribute('href', '/applications')
```

(d) `'shows organizer initials and the session name'` — the exchange name now
renders twice (header title + sidebar row), so:

```ts
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getAllByText('France–Canada 2026').length).toBeGreaterThan(0)
```

(e) `'falls back to the first exchange when activeExchangeId matches none (stale data)'` — same reason:

```ts
    expect(screen.getAllByText('France–Canada 2026').length).toBeGreaterThan(0)
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
```

(f) **Delete** the whole `'dismisses the session selector panel on outside click'` test (lines 128–138). The component no longer exists.

(g) `'shows one Fichiers rail item pointing at /forms'` becomes:

```ts
  it('shows one Fichiers rail item pointing at /forms', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Fichiers')).toBeInTheDocument()
    expect(screen.queryByText('Formulaires / Docs')).toBeNull()
    expect(screen.queryByText('Docs')).toBeNull()
    expect(screen.getByText('Fichiers').closest('a')).toHaveAttribute('href', '/forms')
  })
```

(h) `'Fichiers is active on both /forms and /documents path prefixes'` becomes:

```ts
  it('Fichiers is active on both /forms and /documents path prefixes', () => {
    const { unmount } = renderShell({ pathname: '/forms' })
    expect(screen.getByText('Fichiers').closest('a')).toHaveClass('bg-brand-soft')
    unmount()
    renderShell({ pathname: '/documents/t1' })
    expect(screen.getByText('Fichiers').closest('a')).toHaveClass('bg-brand-soft')
  })
```

(i) Replace `'shows the students search placeholder and no invite button on /students'` (lines 176–180) with:

```ts
  it('renders no search input in the shell on /students', () => {
    renderShell({ pathname: '/students' })
    expect(screen.queryByPlaceholderText('Rechercher un élève…')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })
```

(j) `'shows an Archivé pill for an archived active exchange'` — the pill now
appears in the header *and* on the sidebar row:

```ts
    expect(screen.getAllByText('Archivé')).toHaveLength(2)
```

(k) Append these new tests before the closing `})` of the describe block:

```ts
  it('clicking another exchange switches it and navigates to /dashboard', async () => {
    push.mockClear()
    mockPathname = '/students'
    const two = [
      { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
      { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: false },
    ]
    renderWithIntl(
      <OrganizerShell exchanges={two} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /Espagne 2026/ }))
    await waitFor(() => expect(setActiveExchange).toHaveBeenCalledWith('ex2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('clicking the already-active exchange is a no-op', () => {
    push.mockClear()
    vi.mocked(setActiveExchange).mockClear()
    renderShell({ pathname: '/dashboard' })
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(setActiveExchange).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('the sidebar lists Mes échanges with an + Ajouter affordance', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Mes échanges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('with zero exchanges the sidebar group shows the empty state', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aucun échange')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('the collapse toggle hides labels and persists the preference', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Candidatures')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réduire' }))
    expect(screen.queryByText('Candidatures')).toBeNull()
    // Accessible names survive collapse.
    expect(screen.getByRole('link', { name: 'Candidatures' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aperçu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réglages' })).toBeInTheDocument()
    expect(window.localStorage.getItem('ee.sidebar.collapsed')).toBe('true')
  })

  it('a stored collapsed preference renders collapsed on mount', () => {
    window.localStorage.setItem('ee.sidebar.collapsed', 'true')
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText('Candidatures')).toBeNull()
    expect(screen.getByRole('button', { name: 'Développer' })).toBeInTheDocument()
  })
```

These new tests need `waitFor` and the mocked action. Update the two import
lines at the top of the file:

```ts
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
```

and, after the existing `vi.mock('@/actions/session', …)` call, add a real
import so the mock can be asserted against (it must come *after* the
`vi.mock` calls, next to the `OrganizerShell` import):

```ts
import { setActiveExchange } from '@/actions/session'
import { OrganizerShell } from '@/components/shell/OrganizerShell'
```

- [ ] **Step 2: Update the RailPrefetch test**

In `components/shell/__tests__/RailPrefetch.test.tsx`, replace the label array
on line 39 and add the viewport guard. The full `describe` becomes:

```tsx
describe('rail prefetch', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  })

  it('every rail tab prefetches its full payload', () => {
    renderWithIntl(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    for (const label of ['Aperçu', 'Candidatures', 'Fichiers', 'Élèves']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('data-prefetch', 'true')
    }
  })
})
```

and add `beforeEach` to the vitest import on line 1:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
```

- [ ] **Step 3: Run both suites to verify they fail**

Run: `pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx`
Expected: FAIL — many cases, e.g. `Unable to find an element with the text: Mes échanges`, `Unable to find role="button" and name "Réduire"`.

- [ ] **Step 4: Rewrite `OrganizerShell.tsx`**

Replace `components/shell/OrganizerShell.tsx` in full:

```tsx
'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Mark } from '@/components/brand/Mark'
import { IconOverview, IconApplications, IconForms, IconStudents, IconSettings, IconFeedbackLight, IconCommunication } from './RailIcons'
import { SidebarNav, type SidebarNavItem } from './SidebarNav'
import { ExchangeList } from './ExchangeList'
import { useSidebarCollapsed } from './useSidebarCollapsed'
import { NewExchangeModal } from './NewExchangeModal'
import { FeedbackModal } from './FeedbackModal'
import { ShellUiContext, type ShellUi } from './ShellUiContext'

export type ExchangeOption = { id: string; name: string; year: number; archived: boolean }

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function NewExchangeAutoOpen({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    if (searchParams.get('new-exchange') === '1') {
      onOpen()
      router.replace(pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  return null
}

export function OrganizerShell({
  exchanges,
  activeExchangeId,
  organizerName,
  schoolName,
  atCap = false,
  isTrial = false,
  remaining = Infinity,
  orgRole = 'admin',
  children,
}: {
  exchanges: ExchangeOption[]
  activeExchangeId: string | null
  organizerName: string
  schoolName: string
  atCap?: boolean
  isTrial?: boolean
  remaining?: number
  orgRole?: 'owner' | 'admin'
  children: React.ReactNode
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newExchangeOpen, setNewExchangeOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const active = exchanges.find((e) => e.id === activeExchangeId) ?? exchanges[0] ?? null
  const menuRef = useRef<HTMLDivElement>(null)
  const { collapsed, toggle } = useSidebarCollapsed()

  const isSettings = pathname.startsWith('/settings')

  // Every "+ Nouvel échange" affordance routes through this. At the plan's
  // exchange cap we redirect straight to /billing instead of opening the modal
  // (createExchange would only return an { error: 'limit' } result anyway).
  const handleNewExchange = useCallback(() => {
    if (atCap) {
      router.push('/billing')
      return
    }
    setNewExchangeOpen(true)
  }, [atCap, router])

  const shellUi = useMemo<ShellUi>(() => ({
    openNewExchange: handleNewExchange,
  }), [handleNewExchange])

  // Session-scoped tabs only exist once there is an exchange to scope them to.
  const navItems: SidebarNavItem[] = [
    { href: '/dashboard', label: t('shell.nav.dashboard'), active: pathname === '/dashboard', icon: <IconOverview /> },
    ...(active
      ? [
          { href: '/applications', label: t('shell.nav.applications'), active: pathname.startsWith('/applications'), icon: <IconApplications /> },
          { href: '/forms', label: t('shell.nav.files'), active: pathname.startsWith('/forms') || pathname.startsWith('/documents'), icon: <IconForms /> },
          { href: '/students', label: t('shell.nav.students'), active: pathname.startsWith('/students'), icon: <IconStudents /> },
          { href: '/communication', label: t('shell.nav.communication'), active: pathname.startsWith('/communication'), icon: <IconCommunication /> },
        ]
      : []),
  ]

  const settingsItem: SidebarNavItem[] = [
    { href: '/settings', label: t('shell.accountMenu.settings'), active: isSettings, icon: <IconSettings /> },
  ]

  useEffect(() => {
    if (!menuOpen) return
    function handleOutside(e: Event) {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={null}>
        <NewExchangeAutoOpen onOpen={handleNewExchange} />
      </Suspense>

      <nav
        data-noprint
        className={cn(
          'flex flex-none flex-col overflow-y-auto border-r bg-card py-4 transition-[width] duration-200',
          collapsed ? 'w-[68px]' : 'w-[250px]'
        )}
      >
        <div className={cn('mb-5 flex items-center gap-2', collapsed ? 'justify-center px-3' : 'px-6')}>
          <Mark className="h-[19px] w-[26px] flex-none" />
          {!collapsed && (
            <span className="font-display text-[15px] font-bold tracking-tight text-navy">
              EazyExchange
            </span>
          )}
        </div>

        <SidebarNav items={navItems} collapsed={collapsed} />

        <div className="mt-4">
          <ExchangeList
            exchanges={exchanges}
            activeId={active?.id ?? null}
            collapsed={collapsed}
            onNewExchange={handleNewExchange}
          />
        </div>

        <div className="flex-1" />

        <div className="border-t pt-3">
          <SidebarNav items={settingsItem} collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            title={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            className={cn(
              'mt-0.5 flex items-center rounded-[10px] text-[13.5px] text-muted-foreground hover:bg-hoverrow hover:text-foreground',
              collapsed ? 'mx-auto h-10 w-10 justify-center' : 'mx-3 gap-3 px-3 py-2.5'
            )}
          >
            <span className="flex h-[18px] w-[18px] flex-none items-center justify-center">
              {collapsed
                ? <ChevronsRightIcon aria-hidden size={18} strokeWidth={1.75} />
                : <ChevronsLeftIcon aria-hidden size={18} strokeWidth={1.75} />}
            </span>
            {!collapsed && <span>{t('shell.sidebar.collapse')}</span>}
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-noprint className="flex h-[66px] flex-none items-center justify-between gap-5 border-b bg-card px-7">
          <div className="flex items-center gap-3.5">
            {isSettings ? (
              <span className="font-display text-base font-semibold text-navy">{schoolName}</span>
            ) : active ? (
              <>
                <span className="font-display text-base font-semibold text-navy">{active.name}</span>
                {active.archived && (
                  <span className="rounded-pill bg-subtle px-3 py-1 font-mono text-[11px] font-semibold text-muted-foreground">
                    {t('shell.archivedBadge')}
                  </span>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleNewExchange}
                className="flex h-[38px] items-center gap-1.5 rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover"
              >
                {c('actions.newExchange')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="flex h-[38px] items-center gap-2 rounded-[9px] border px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-hoverrow hover:text-foreground"
            >
              <IconFeedbackLight />
              <span>{t('shell.nav.feedback')}</span>
            </button>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={t('shell.accountMenu.trigger')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle font-mono text-[11px] font-semibold text-navy hover:bg-hoverrow"
              >
                {initials(organizerName)}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-[11px] border bg-card p-1 shadow-float">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full rounded-[8px] px-3 py-2 text-left text-sm text-foreground hover:bg-hoverrow"
                  >
                    {t('shell.accountMenu.signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-7 pb-10 pt-[26px]">
          <div className="mx-auto max-w-6xl">
            <ShellUiContext.Provider value={shellUi}>
              {children}
            </ShellUiContext.Provider>
          </div>
        </main>
      </div>
      <NewExchangeModal
        open={newExchangeOpen}
        onOpenChange={setNewExchangeOpen}
        isTrial={isTrial}
        remaining={remaining}
        isOwner={orgRole === 'owner'}
      />
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  )
}
```

- [ ] **Step 5: Delete `SessionSelector` and its test**

```bash
git rm components/shell/SessionSelector.tsx components/shell/__tests__/SessionSelector.test.tsx
```

`getExchangeProgressSummaries` in `actions/exchanges.ts` stays — the Aperçu page still calls it. Do not delete it.

- [ ] **Step 6: Run the shell suites to verify they pass**

Run: `pnpm vitest run components/shell/ components/students/`
Expected: PASS — no `SessionSelector.test.tsx` in the run, all OrganizerShell / RailPrefetch / SidebarNav / ExchangeList / useSidebarCollapsed / StudentsView cases green.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add components/shell/OrganizerShell.tsx components/shell/__tests__/OrganizerShell.test.tsx \
        components/shell/__tests__/RailPrefetch.test.tsx
git commit -m "feat(shell): wide light sidebar with inline exchange list, drop SessionSelector"
```

---

### Task 7: Full gate and manual browser check

**Files:** none modified unless the gate turns up a break.

**Interfaces:**
- Consumes: everything above.
- Produces: a branch that is safe to merge.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors. Common breaks to fix in place: an unused `useState`/`within`/`vi` import left behind in a test file, or an unused `IconFeedback` import.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all suites pass. `vitest.config.ts` already excludes `**/.claude/**`, so sibling worktrees are not swept. If a single file fails once and passes on re-run, that is a neighbouring session mid-write — re-run the file before debugging it.

- [ ] **Step 3: Typecheck and build**

Run: `pnpm build`
Expected: compiles with no type errors. Watch for `ExchangeOption` import cycles — the `ExchangeList` → `OrganizerShell` import is `import type`, so it must erase cleanly.

- [ ] **Step 4: Manual browser check (required before merge)**

```bash
pnpm dev     # reads .wtport → http://localhost:3347
```

Sign in as an organizer and verify, at `http://localhost:3347/dashboard`:

1. Sidebar is 250px, light (`bg-card`) with a right border; mark + « EazyExchange » wordmark at the top.
2. Full labels — « Candidatures », « Fichiers », « Communication » — no truncation.
3. Active nav item has the pale blue `brand.soft` background and blue text; inactive items are grey and go pale on hover.
4. « Mes échanges » group renders every exchange with a coloured dot, the active row on `bg-subtle` and bold, archived rows carrying an « Archivé » pill.
5. Clicking a non-active exchange switches the session and lands on `/dashboard`; the header title updates.
6. « + Ajouter » opens the New Exchange modal (or routes to `/billing` at cap).
7. « Réduire » collapses to 68px as a width transition, not a jump: icons only, dots only, `+` button, chevron flips to « Développer ». Hovering shows the tooltips. Reload — it stays collapsed. Expand, reload — it stays expanded.
8. Header: exchange name (plain text, no `▾`), Feedback button, avatar initials; clicking the avatar opens the sign-out popover downward and outside-click dismisses it.
9. `/students`: the search field is in the page toolbar above the status chips and filters the list; the header has no search field on any route.
10. `/settings`: the header shows the school name and the Réglages sidebar item is active.
11. Sign out, sign in as an organizer with zero exchanges: only Aperçu + Réglages in the nav, « Aucun échange » in the group, header shows the « Nouvel échange » CTA.

- [ ] **Step 5: Report and hand off**

Report the gate output and the browser-check result to Bjorn. Do not merge or
push without his confirmation — merging `main` deploys to production. When he
confirms, merge and leave via `ExitWorktree` (`remove`).

Per the spec's concurrency note: `feature/i18n-phase3-student-apply` also edits
`messages/*.json`. **Merge this branch last**, and re-run `pnpm lint && pnpm test && pnpm build`
after the merge — the parity test is the tripwire for a bad `messages/*.json` merge.
