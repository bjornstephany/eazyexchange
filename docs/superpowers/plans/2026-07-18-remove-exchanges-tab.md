# Remove Exchanges Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Exchanges rail tab and its pages, surface per-exchange completion counts as a lazy-loaded second line in the exchange dropdown, rehome the automatic-reminder settings into Settings → Programme (visible to all organizers), and make submission review return via history-back.

**Architecture:** A pure `progressSummary` helper in `lib/dashboard/rollup.ts` computes label-free `{ done, total, kind }` numbers; a new server action `getExchangeProgressSummaries` in `actions/exchanges.ts` runs it per visible exchange (reusing `listApplications` + `getExchangeGrid` + `rollupStudent`, so numbers always match the dashboard) and the client `SessionSelector` fetches it once on first open and formats with the existing i18n keys. The `/exchanges` pages and `ExchangesView` are deleted (submission-review subroute stays); `getProgramInfo` relaxes to any organizer and carries the reminder fields so `ProgramCard` can host `ReminderSettingsCard`; `SubmissionReview` switches to `router.back()`.

**Tech Stack:** Next.js 14 App Router, Server Actions, next-intl, Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-18-remove-exchanges-tab-design.md`

**Supersedes:** `docs/superpowers/plans/2026-07-18-reminder-settings-move.md` (never executed). Its Tasks 1–2 are absorbed here as Tasks 8–9; its Task 3 (repurpose `ExchangesView` cards) conflicts with this spec (the whole `/exchanges` surface is deleted) and is dropped. Task 1 below marks that plan superseded.

## Global Constraints

- Package manager is **pnpm**. Test runner: `pnpm vitest run <file>` for single files, `pnpm test` for the suite.
- Work on branch **`feature/remove-exchanges-tab`** (created in Task 1; use a git worktree per superpowers:using-git-worktrees when executing — other sessions share this checkout, and the main checkout's `pnpm test` can sweep other sessions' `.claude/worktrees/*` test files, producing false failures; judge failures by file path).
- **No new i18n keys.** The dropdown reuses `organizer.dashboard.progressDossiers` / `organizer.dashboard.progressCandidatures`; the reminder card keeps `organizer.exchanges.reminders.*`. Keys are only *removed* (Task 6) or *reworded* (Task 10), always in **all 5 locales** (en/fr/es/it/de) in the same commit — `messages/__tests__/parity.test.ts` fails otherwise.
- **No DB migration, no RLS change, no edge-function change** → `pnpm test:rls` not required.
- `pnpm build` fails locally (placeholder env) — use `npx tsc --noEmit` for type checking.
- Server-side owner checks on `archiveExchange`/`restoreExchange` must NOT be touched — only `getProgramInfo` relaxes.
- Stage only the files named in each task's commit step (never `git add -A` — PII risk from untracked files).
- FR strings in test assertions are exact, copied from `messages/fr.json` — do not "fix" accents, `–` en-dashes, or `…` ellipses.
- `app/robots.ts` keeps its `/exchanges` disallow (submission-review URLs still live under it) — do not touch it.
- Keep `app/(organizer)/exchanges/[id]/loading.tsx` and the `[id]/applications`, `[id]/forms`, `[id]/submissions` subroutes — only the two index pages and the list skeleton are deleted (Task 6).

---

### Task 1: Branch + mark the old plan superseded

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-reminder-settings-move.md` (top banner only)

**Interfaces:**
- Consumes: nothing.
- Produces: branch `feature/remove-exchanges-tab` that all later tasks commit to.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --rebase && git checkout -b feature/remove-exchanges-tab
```

(If `git pull --rebase` fails on DNS, see memory: point `/etc/resolv.conf` at 8.8.8.8 — or continue from local main; this branch merges via PR anyway.)

- [ ] **Step 2: Add the supersede banner**

In `docs/superpowers/plans/2026-07-18-reminder-settings-move.md`, insert directly under the H1 title line:

```markdown
> **SUPERSEDED (2026-07-18, never executed):** folded into
> `2026-07-18-remove-exchanges-tab.md` (its Tasks 8–9). Task 3 here conflicts
> with the newer spec (ExchangesView is deleted, not repurposed). Do not execute.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-reminder-settings-move.md
git commit -m "docs(plan): supersede reminder-settings-move plan"
```

---

### Task 2: Pure helper `progressSummary` in the rollup library

**Files:**
- Modify: `lib/dashboard/rollup.ts` (append near `exchangeProgress`, ~line 332)
- Test: `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: existing `AppRow`, `DossierRollup`, `dossierComplete` from the same module.
- Produces: `export type ExchangeProgressSummary = { done: number; total: number; kind: 'dossiers' | 'candidatures' } | null` and `export function progressSummary(apps: AppRow[], rollups: DossierRollup[]): ExchangeProgressSummary`. Tasks 3 and 4 rely on both. `exchangeProgress` is left in place for now (still imported by the /exchanges page until Task 6 deletes both).

- [ ] **Step 1: Write the failing tests**

In `lib/dashboard/__tests__/rollup.test.ts`, add `progressSummary` to the import list from `@/lib/dashboard/rollup` (line 4–11 block), then append after the existing `describe('exchangeProgress', …)` block:

```ts
describe('progressSummary', () => {
  it('dossier progress once students are enrolled', () => {
    const R2 = [ROLLUPS[0], rollupStudent({ id: 's2', full_name: 'B' }, T, {}, TODAY, t)]
    expect(progressSummary([app('submitted')], R2)).toEqual({ done: 1, total: 2, kind: 'dossiers' })
  })
  it('candidature progress before any enrollment', () => {
    expect(progressSummary([app('submitted'), app('accepted')], []))
      .toEqual({ done: 1, total: 2, kind: 'candidatures' })
  })
  it('null when there is nothing to count', () => {
    expect(progressSummary([], [])).toBeNull()
  })
  it('empty dossiers count in the total but never as done', () => {
    const empty = rollupStudent({ id: 's9', full_name: 'Vide' }, [], {}, TODAY, t)
    expect(progressSummary([], [empty])).toEqual({ done: 0, total: 1, kind: 'dossiers' })
  })
})
```

(`ROLLUPS`, `T`, `TODAY`, `app`, `t` are existing fixtures in this file.)

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `progressSummary` is not exported. Existing tests PASS.

- [ ] **Step 3: Implement**

In `lib/dashboard/rollup.ts`, directly above the existing `exchangeProgress` function (~line 332), add:

```ts
// Raw, label-free exchange progress for the shell's exchange dropdown: dossier
// progress once anyone is enrolled, candidature progress before that, null when
// there is nothing to count. The client formats the label with the existing
// organizer.dashboard.progress* keys, so the numbers always match the dashboard.
export type ExchangeProgressSummary = {
  done: number
  total: number
  kind: 'dossiers' | 'candidatures'
} | null

export function progressSummary(apps: AppRow[], rollups: DossierRollup[]): ExchangeProgressSummary {
  if (rollups.length > 0) {
    return { done: rollups.filter(r => dossierComplete(r)).length, total: rollups.length, kind: 'dossiers' }
  }
  if (apps.length === 0) return null
  return { done: apps.filter(a => a.status !== 'submitted').length, total: apps.length, kind: 'candidatures' }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS (all, including the four new tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts
git commit -m "feat(dashboard): pure progressSummary helper for dropdown counts"
```

---

### Task 3: Server action `getExchangeProgressSummaries`

**Files:**
- Modify: `actions/exchanges.ts` (imports + new action appended at end)
- Create: `actions/__tests__/exchange-progress-summaries.test.ts`

**Interfaces:**
- Consumes: `progressSummary` + `ExchangeProgressSummary` from Task 2; existing `getExchanges`, `getExchangeGrid` (same file), `listApplications(exchangeId)` from `actions/applications-review`, `rollupStudent` from `lib/dashboard/rollup`, `requireOrganizer` from `lib/auth/require`, `getTranslations` from `next-intl/server` (root-translator pattern already used in `actions/students.ts:85`).
- Produces: `export async function getExchangeProgressSummaries(): Promise<Record<string, ExchangeProgressSummary>>` — keyed by exchange id, `null` for an exchange with nothing to count *or* whose computation failed. Task 4's `SessionSelector` calls it. `ExchangeProgressSummary` is also re-exported (type-only) from `actions/exchanges.ts`.

- [ ] **Step 1: Write the failing test**

Create `actions/__tests__/exchange-progress-summaries.test.ts` with exactly:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  role: string
  exchanges: { id: string }[]
  appsByExchange: Record<string, { id: string; status: string; submitted_at: string | null; data: Record<string, string>; email: string }[]>
  failFor: string | null
}

// Chainable, thenable builder: list queries are awaited at an arbitrary chain
// end (then), row lookups end in single/maybeSingle. Per-table data below.
function table(data: unknown, row?: unknown) {
  const b: any = {
    select: () => b, eq: () => b, or: () => b, order: () => b, in: () => b,
    returns: () => b,
    single: async () => ({ data: row ?? null }),
    maybeSingle: async () => ({ data: row ?? null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      if (t === 'users') return table(null, { school_id: 's1', role: scenario.role })
      if (t === 'exchanges') return table(scenario.exchanges, { school_a_id: 's1', school_b_id: null })
      // form_templates / exchange_enrollments: empty → no rollups, candidature path.
      return table([])
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => ((key: string) => key),
}))
vi.mock('@/actions/applications-review', () => ({
  listApplications: async (id: string) => {
    if (scenario.failFor === id) throw new Error('boom')
    return scenario.appsByExchange[id] ?? []
  },
}))

import { getExchangeProgressSummaries } from '@/actions/exchanges'

const app = (status: string) => ({
  id: Math.random().toString(), status, submitted_at: '2026-09-12', data: {}, email: 'x@y.fr',
})

beforeEach(() => {
  scenario = {
    role: 'organizer',
    exchanges: [{ id: 'ex-1' }, { id: 'ex-2' }, { id: 'ex-3' }],
    appsByExchange: { 'ex-1': [app('submitted'), app('accepted'), app('enrolled')] },
    failFor: null,
  }
})

describe('getExchangeProgressSummaries', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(getExchangeProgressSummaries()).rejects.toThrow('Unauthorized')
  })

  it('returns candidature counts per exchange, null when nothing to count', async () => {
    const result = await getExchangeProgressSummaries()
    expect(result['ex-1']).toEqual({ done: 2, total: 3, kind: 'candidatures' })
    expect(result['ex-2']).toBeNull()
    expect(result['ex-3']).toBeNull()
  })

  it('one failing exchange yields null for that row, not a thrown action', async () => {
    scenario.failFor = 'ex-1'
    const result = await getExchangeProgressSummaries()
    expect(result['ex-1']).toBeNull()
    expect(result['ex-2']).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run actions/__tests__/exchange-progress-summaries.test.ts`
Expected: FAIL — `getExchangeProgressSummaries` is not exported from `@/actions/exchanges`.

- [ ] **Step 3: Implement the action**

In `actions/exchanges.ts`:

(a) Add to the imports at the top:

```ts
import { getTranslations } from 'next-intl/server'
import { listApplications } from './applications-review'
import {
  rollupStudent, progressSummary,
  type AppRow, type TemplateInfo, type ExchangeProgressSummary,
} from '@/lib/dashboard/rollup'
```

(b) Append at the end of the file:

```ts
// Re-export for dropdown consumers (type-only exports are legal in 'use server').
export type { ExchangeProgressSummary }

// Per-exchange completion counts for the shell's exchange dropdown. Reuses the
// same pipeline as the dashboard (listApplications + grid → rollupStudent →
// progressSummary) so the numbers always agree with it. Fetched lazily on
// first dropdown open — never from the organizer layout.
export async function getExchangeProgressSummaries(): Promise<Record<string, ExchangeProgressSummary>> {
  await requireOrganizer()
  const exchanges = await getExchanges()
  const tr = await getTranslations()

  const entries = await Promise.all(
    exchanges.map(async (exchange): Promise<[string, ExchangeProgressSummary]> => {
      // One bad exchange must never break the dropdown: fail to null.
      try {
        const [applications, grid] = await Promise.all([
          listApplications(exchange.id),
          getExchangeGrid(exchange.id),
        ])
        const apps: AppRow[] = applications.map(a => ({
          id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email,
        }))
        const templates: TemplateInfo[] = grid.templates.map(t => ({
          id: t.id, type: t.type as TemplateInfo['type'], name: t.name, deadline: t.deadline as string,
        }))
        const rollups = grid.students.map(s => rollupStudent(s, templates, grid.cellMap, undefined, tr))
        return [exchange.id, progressSummary(apps, rollups)]
      } catch {
        return [exchange.id, null]
      }
    }),
  )
  return Object.fromEntries(entries)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/exchange-progress-summaries.test.ts actions/__tests__/exchanges.test.ts`
Expected: PASS (both files — the existing exchanges tests must not regress).

- [ ] **Step 5: Commit**

```bash
git add actions/exchanges.ts actions/__tests__/exchange-progress-summaries.test.ts
git commit -m "feat(shell): getExchangeProgressSummaries server action"
```

---

### Task 4: Dropdown second lines in `SessionSelector`

**Files:**
- Modify: `components/shell/SessionSelector.tsx`
- Create: `components/shell/__tests__/SessionSelector.test.tsx`
- Modify: `components/shell/__tests__/OrganizerShell.test.tsx` (mock only)
- Modify: `components/shell/__tests__/RailPrefetch.test.tsx` (mock only)

**Interfaces:**
- Consumes: `getExchangeProgressSummaries(): Promise<Record<string, ExchangeProgressSummary>>` from Task 3; `ExchangeProgressSummary` type from `@/lib/dashboard/rollup`; i18n keys `organizer.dashboard.progressDossiers` (fr: `{done} / {total} dossiers validés`) and `organizer.dashboard.progressCandidatures` (fr: `{done} / {total} candidatures traitées`).
- Produces: no API change — `SessionSelector` props are unchanged. Rows gain a muted second line when a summary exists.

- [ ] **Step 1: Update the shell test mocks (required before SessionSelector calls the new action)**

In BOTH `components/shell/__tests__/OrganizerShell.test.tsx` and `components/shell/__tests__/RailPrefetch.test.tsx`, extend the existing exchanges-action mock:

```ts
vi.mock('@/actions/exchanges', () => ({
  createExchange: vi.fn(),
  getExchangeProgressSummaries: vi.fn().mockResolvedValue({}),
}))
```

(Without this, the OrganizerShell test that opens the selector panel would call `undefined()` from the new effect.)

- [ ] **Step 2: Write the failing SessionSelector tests**

Create `components/shell/__tests__/SessionSelector.test.tsx` with exactly:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn().mockResolvedValue(undefined) }))
const getExchangeProgressSummaries = vi.fn()
vi.mock('@/actions/exchanges', () => ({
  getExchangeProgressSummaries: (...a: unknown[]) => getExchangeProgressSummaries(...a),
}))

import { SessionSelector } from '@/components/shell/SessionSelector'

const exchanges = [
  { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
  { id: 'ex2', name: 'Espagne 2025', year: 2025, archived: true },
]

function renderSelector() {
  return renderWithIntl(
    <SessionSelector exchanges={exchanges} active={exchanges[0]} onNewExchange={() => {}} />
  )
}

describe('SessionSelector completion counts', () => {
  beforeEach(() => getExchangeProgressSummaries.mockReset())

  it('fetches summaries once on first open and renders second lines (archived rows too)', async () => {
    getExchangeProgressSummaries.mockResolvedValue({
      ex1: { done: 12, total: 18, kind: 'dossiers' },
      ex2: { done: 1, total: 3, kind: 'candidatures' },
    })
    renderSelector()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(await screen.findByText('12 / 18 dossiers validés')).toBeInTheDocument()
    expect(screen.getByText('1 / 3 candidatures traitées')).toBeInTheDocument()
    // Close and reopen: cached for the mount lifetime, no second call.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(getExchangeProgressSummaries).toHaveBeenCalledTimes(1)
  })

  it('null summary renders no second line for that row', async () => {
    getExchangeProgressSummaries.mockResolvedValue({
      ex1: null,
      ex2: { done: 1, total: 3, kind: 'candidatures' },
    })
    renderSelector()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(await screen.findByText('1 / 3 candidatures traitées')).toBeInTheDocument()
    expect(screen.queryByText(/dossiers validés/)).toBeNull()
  })

  it('fetch failure renders rows without second lines (never blocks switching)', async () => {
    getExchangeProgressSummaries.mockRejectedValue(new Error('boom'))
    renderSelector()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    await waitFor(() => expect(getExchangeProgressSummaries).toHaveBeenCalled())
    expect(screen.getByText('Espagne 2025')).toBeInTheDocument()
    expect(screen.queryByText(/validés|traitées/)).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run components/shell/__tests__/SessionSelector.test.tsx`
Expected: FAIL — no second lines rendered, `getExchangeProgressSummaries` never called.

- [ ] **Step 4: Implement the SessionSelector changes**

In `components/shell/SessionSelector.tsx`:

(a) Extend the imports:

```tsx
import { getExchangeProgressSummaries } from '@/actions/exchanges'
import type { ExchangeProgressSummary } from '@/lib/dashboard/rollup'
```

(b) Inside the component, after the existing `const wrapperRef…` line, add state + the lazy one-shot fetch:

```tsx
  const [summaries, setSummaries] = useState<Record<string, ExchangeProgressSummary>>({})
  const summariesRequested = useRef(false)

  useEffect(() => {
    if (!open || summariesRequested.current) return
    summariesRequested.current = true
    // Lazy one-shot fetch on first open; cached for the mount lifetime.
    // Fail quiet — rows must render (and switch) without second lines.
    getExchangeProgressSummaries().then(setSummaries).catch(() => {})
  }, [open])
```

(c) Replace the row rendering (the `exchanges.map` block) with a two-line layout — name + archived badge + year stay on the first line, the summary is a muted second line:

```tsx
          {exchanges.map((ex) => {
            const summary = summaries[ex.id]
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => select(ex.id)}
                className={cn(
                  'w-full rounded-[9px] px-3 py-2 text-left text-sm hover:bg-hoverrow',
                  ex.id === active.id && 'bg-subtle font-semibold'
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {ex.name}
                    {ex.archived && (
                      <span className="rounded-pill bg-subtle px-2 py-px text-[10px] font-semibold text-muted-foreground">{t('shell.archivedBadge')}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{ex.year}</span>
                </span>
                {summary && (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {summary.kind === 'dossiers'
                      ? t('dashboard.progressDossiers', { done: summary.done, total: summary.total })
                      : t('dashboard.progressCandidatures', { done: summary.done, total: summary.total })}
                  </span>
                )}
              </button>
            )
          })}
```

- [ ] **Step 5: Run the shell tests to verify everything passes**

Run: `pnpm vitest run components/shell/__tests__/SessionSelector.test.tsx components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx`
Expected: PASS (all three files).

- [ ] **Step 6: Commit**

```bash
git add components/shell/SessionSelector.tsx components/shell/__tests__/SessionSelector.test.tsx components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx
git commit -m "feat(shell): lazy dossier-completion second lines in the exchange dropdown"
```

---

### Task 5: Remove the Exchanges rail item

**Files:**
- Modify: `components/shell/OrganizerShell.tsx` (import line 9, RailItem block lines 159–165)
- Modify: `components/shell/RailIcons.tsx` (delete `IconExchanges`, lines 12–19)
- Modify: `components/shell/__tests__/OrganizerShell.test.tsx`
- Modify: `components/shell/__tests__/RailPrefetch.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: rail without an Exchanges item; on `/exchanges/[id]/submissions/*` no rail item is active (same as `/settings` today — Aperçu's active check is `pathname === '/dashboard'` and stays unchanged). The i18n key `organizer.shell.nav.exchanges` becomes unused here and is removed in Task 6.

- [ ] **Step 1: Update the tests to the new rail**

In `components/shell/__tests__/OrganizerShell.test.tsx`:

(a) In `renders the French rail items when an exchange is active`, replace the `Échanges` expectation with an absence check:

```tsx
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.queryByText('Échanges')).toBeNull()
    expect(screen.getByText('Candid.')).toBeInTheDocument()
```

(b) In `rail points at the session-scoped top-level routes`, delete the line asserting the `Échanges` link href (keep the `Candid.` line).

(c) Replace the whole test `Échanges stays visible with zero exchanges` with:

```tsx
  it('only Aperçu stays with zero exchanges', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Aperçu/ })).toBeInTheDocument()
    expect(screen.queryByText('Échanges')).toBeNull()
    expect(screen.queryByText('Candid.')).toBeNull()
  })
```

(d) In `falls back to the first exchange when activeExchangeId matches none (stale data)`, replace `expect(screen.getByText('Échanges')).toBeInTheDocument()` with `expect(screen.getByText('Aperçu')).toBeInTheDocument()`.

In `components/shell/__tests__/RailPrefetch.test.tsx`, remove `'Échanges'` from the label array:

```tsx
    for (const label of ['Aperçu', 'Candid.', 'Formul.', 'Docs', 'Élèves']) {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx`
Expected: FAIL — the rail still renders `Échanges` (the `queryByText('Échanges')` assertions).

- [ ] **Step 3: Implement the removal**

In `components/shell/OrganizerShell.tsx`:

(a) Import line 9 loses `IconExchanges`:

```tsx
import { IconOverview, IconApplications, IconForms, IconDocs, IconStudents, IconFeedback } from './RailIcons'
```

(b) Delete the whole Exchanges `RailItem` block (lines 159–165):

```tsx
          <RailItem
            href="/exchanges"
            label={t('shell.nav.exchanges')}
            active={pathname === '/exchanges' || (pathname.startsWith('/exchanges/') && !pathname.includes('/applications'))}
          >
            <IconExchanges />
          </RailItem>
```

In `components/shell/RailIcons.tsx`, delete the `IconExchanges` function (lines 12–19) — nothing else imports it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add components/shell/OrganizerShell.tsx components/shell/RailIcons.tsx components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx
git commit -m "feat(shell): remove the Exchanges rail tab"
```

---

### Task 6: Delete the orphaned pages, `ExchangesView`, `exchangeProgress`, and the dead i18n keys

**Files:**
- Delete: `app/(organizer)/exchanges/page.tsx`, `app/(organizer)/exchanges/loading.tsx`, `app/(organizer)/exchanges/[id]/page.tsx`, `components/exchanges/ExchangesView.tsx`, `components/exchanges/__tests__/ExchangesView.test.tsx`
- Modify: `app/__tests__/organizer-loading-skeletons.test.tsx` (drop the exchanges list skeleton)
- Modify: `lib/dashboard/rollup.ts` (delete `exchangeProgress`), `lib/dashboard/__tests__/rollup.test.ts` (delete its describe + import)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`

**Interfaces:**
- Consumes: Task 5 (last consumer of `organizer.shell.nav.exchanges` is gone).
- Produces: `/exchanges` and `/exchanges/[id]` 404 (expected); `exchangeProgress` no longer exists (`progressSummary` from Task 2 is its replacement); `organizer.exchanges.*` keeps ONLY the `reminders` block. Keep `app/(organizer)/exchanges/[id]/loading.tsx` (imported by the skeleton test; serves the surviving submissions subroute) and all `[id]/` subdirectories.

- [ ] **Step 1: Delete the files**

```bash
git rm "app/(organizer)/exchanges/page.tsx" "app/(organizer)/exchanges/loading.tsx" "app/(organizer)/exchanges/[id]/page.tsx" components/exchanges/ExchangesView.tsx components/exchanges/__tests__/ExchangesView.test.tsx
```

- [ ] **Step 2: Update the skeleton test**

In `app/__tests__/organizer-loading-skeletons.test.tsx`: delete line 5 (`import ExchangesLoading …`) and the `['exchanges', ExchangesLoading],` entry from the `skeletons` array. Keep `ExchangeDetailLoading` (line 10) and its `['exchanges/[id]', ExchangeDetailLoading]` entry — that skeleton still serves the submission-review subroute.

- [ ] **Step 3: Remove `exchangeProgress`**

In `lib/dashboard/rollup.ts`, delete the `exchangeProgress` function (the final function in the file, with its `// Exchange-card progress (Échanges page)…` comment). In `lib/dashboard/__tests__/rollup.test.ts`, remove `exchangeProgress` from the import list and delete the whole `describe('exchangeProgress', …)` block (the `progressSummary` describe from Task 2 stays).

- [ ] **Step 4: Remove the dead i18n keys in all 5 locales**

Do NOT round-trip the JSON through a serializer — the catalogs contain hand-compacted inline objects that would reformat. Make two surgical Edit-tool edits per file (both regions sit at lines ~134–136 and ~307–312 in every locale).

Edit A — delete the nav key (line after `"dashboard"` inside `organizer.shell.nav`):

| file | delete this line |
|---|---|
| `messages/en.json` | `        "exchanges": "Exchanges",` |
| `messages/fr.json` | `        "exchanges": "Échanges",` |
| `messages/es.json` | `        "exchanges": "Intercambios",` |
| `messages/it.json` | `        "exchanges": "Scambi",` |
| `messages/de.json` | `        "exchanges": "Austausche",` |

(Use the preceding `"dashboard": …,` line plus this line as the unique `old_string`; the replacement keeps only the dashboard line.)

Edit B — collapse the `organizer.exchanges` block to its `reminders` sub-block. For `messages/fr.json` replace:

```json
    "exchanges": {
      "title": "Échanges",
      "subtitle": "Suivez tous vos programmes d'échange — passés, en cours et à venir.",
      "listLabel": "Vos échanges",
      "emptyState": "Aucun échange pour l'instant — créez le premier.",
      "reminders": {
```

with:

```json
    "exchanges": {
      "reminders": {
```

Same shape in the other four locales (each block starts at ~line 307) — the four lines to delete per file:

- `en`: `"title": "Exchanges"`, `"subtitle": "Track all your exchange programs — past, ongoing and upcoming."`, `"listLabel": "Your exchanges"`, `"emptyState": "No exchange yet — create the first one."`
- `es`: `"title": "Intercambios"`, `"subtitle": "Haga seguimiento de todos sus programas de intercambio — pasados, en curso y próximos."`, `"listLabel": "Sus intercambios"`, `"emptyState": "Ningún intercambio por el momento — cree el primero."`
- `it`: `"title": "Scambi"`, `"subtitle": "Segui tutti i tuoi programmi di scambio — passati, in corso e futuri."`, `"listLabel": "I tuoi scambi"`, `"emptyState": "Nessuno scambio per il momento — crea il primo."`
- `de`: `"title": "Austausche"`, `"subtitle": "Verfolgen Sie alle Ihre Austauschprogramme — vergangene, laufende und kommende."`, `"listLabel": "Ihre Austausche"`, `"emptyState": "Noch kein Austausch — erstellen Sie den ersten."`

Then verify:

```bash
git diff --stat messages/
```

Expected: exactly 5 deleted lines per locale file (1 nav + 4 page keys), zero other changes. `organizer.exchanges.reminders.*` must survive — `git diff messages/fr.json | grep reminders` prints nothing.

- [ ] **Step 5: Check nothing references the deleted surface**

```bash
grep -rn "ExchangesView\|exchangeProgress\|nav\.exchanges\|exchanges\.title\|exchanges\.subtitle\|exchanges\.listLabel\|exchanges\.emptyState" app components actions lib --include="*.ts*" | grep -v ".claude"
```

Expected: no output.

- [ ] **Step 6: Run the affected suites + type check**

Run: `pnpm vitest run app/__tests__/organizer-loading-skeletons.test.tsx lib/dashboard/__tests__/rollup.test.ts messages/__tests__/parity.test.ts components/exchanges/__tests__/ReminderSettingsCard.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc silent (the generated `IntlMessages` key gate proves no live code uses the removed keys).

- [ ] **Step 7: Commit**

```bash
git add -u app components lib messages
git commit -m "feat(exchanges): delete the Exchanges pages, ExchangesView and dead i18n keys"
```

(`git add -u` stages only tracked-file modifications/deletions — the named directories contain no untracked PII by construction, and Step 1's `git rm` already staged the deletions.)

---

### Task 7: Retarget the stale `/exchanges` revalidations

**Files:**
- Modify: `actions/applications-review.ts` (lines ~156, ~197)
- Modify: `actions/forms.ts` (lines ~237, ~298, ~338 + their comments)
- Modify: `actions/submissions.ts` (lines ~320, ~386 + the comment at ~321)
- Modify: `actions/exchanges.ts` (`setApplicationOpen`, line ~245)
- Modify: `actions/__tests__/bulk-applications.test.ts` (lines ~88–90, ~102 — asserts the removed path)

**Interfaces:**
- Consumes: nothing new.
- Produces: no `revalidatePath` targeting `/exchanges` or `/exchanges/${id}` remains anywhere except `updateReminderSettings` (retargeted in Task 8). `approveSubmission`/`rejectSubmission` now revalidate `/documents` so history-back (Task 10) lands on fresh data.

- [ ] **Step 1: Apply the edits**

(a) `actions/applications-review.ts`: delete the line `revalidatePath('/exchanges')` in BOTH `inviteApplicant` (~156) and `rejectApplication` (~197). The `revalidatePath(\`/exchanges/${app.exchange_id}/applications\`)` lines above them STAY (that legacy subroute still exists).

(b) `actions/forms.ts`: three occurrences.

At ~235–237 (`updateTemplateMeta`), replace:

```ts
  // Name/deadline also feed the dashboard grid and the exchange cards' %
  // complete once the template is active.
  revalidatePath('/dashboard')
  revalidatePath('/exchanges')
```

with:

```ts
  // Name/deadline also feed the dashboard grid once the template is active.
  revalidatePath('/dashboard')
```

At ~296–298 (`activateTemplate`), replace:

```ts
  // Newly active → now appears in the dashboard grid and exchange % complete.
  revalidatePath('/dashboard')
  revalidatePath('/exchanges')
```

with:

```ts
  // Newly active → now appears in the dashboard grid.
  revalidatePath('/dashboard')
```

At ~336–338 (`deleteTemplate`), replace:

```ts
  // If it was active, it drops off the dashboard grid and exchange % complete.
  revalidatePath('/dashboard')
  revalidatePath('/exchanges')
```

with:

```ts
  // If it was active, it drops off the dashboard grid.
  revalidatePath('/dashboard')
```

(c) `actions/submissions.ts`: in `approveSubmission` (~320) replace:

```ts
  revalidatePath(`/exchanges`)
  // Approval status also drives the dashboard grid and the student directory
  // cellMap (organizer's own browser). The student's /my-forms view is a
  // different actor — accepted cross-actor staleness per the spec (§1c).
  revalidatePath('/dashboard')
  revalidatePath('/students')
```

with:

```ts
  // Review returns via history-back to its origin list (Documents drawer or
  // Student detail) — keep both fresh, plus the dashboard grid. The student's
  // /my-forms view is a different actor — accepted cross-actor staleness.
  revalidatePath('/documents')
  revalidatePath('/dashboard')
  revalidatePath('/students')
```

and in `rejectSubmission` (~386) replace:

```ts
  revalidatePath(`/exchanges`)
  // Same surfaces (and same cross-actor exemption) as approveSubmission above.
  revalidatePath('/dashboard')
  revalidatePath('/students')
```

with:

```ts
  // Same surfaces (and same cross-actor exemption) as approveSubmission above.
  revalidatePath('/documents')
  revalidatePath('/dashboard')
  revalidatePath('/students')
```

(d) `actions/exchanges.ts`, `setApplicationOpen` (~245): delete the line `revalidatePath(\`/exchanges/${exchangeId}\`)` (the `/applications` and `/dashboard` revalidations below it stay).

(e) `actions/__tests__/bulk-applications.test.ts` — the bulk actions delegate to `acceptApplication`/`rejectApplication`, whose `/exchanges` revalidation is gone. In `acceptApplications › accepts each id and reports partial failure` (~lines 88–90) replace:

```ts
    // Phase-1 progress on the exchanges-list card is derived from application
    // status, so an accept must invalidate the router cache for /exchanges too.
    expect(revalidatePath).toHaveBeenCalledWith('/exchanges')
```

with:

```ts
    // Application status feeds the dashboard rollups — an accept must
    // invalidate the router cache for /dashboard too.
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
```

and in `rejectApplications › rejects each id with the shared note` (~line 102) replace:

```ts
    expect(revalidatePath).toHaveBeenCalledWith('/exchanges')
```

with:

```ts
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
```

- [ ] **Step 2: Verify only the reminder revalidation remains**

```bash
grep -rn "revalidatePath.*exchanges" actions/ | grep -v "applications\`"
```

Expected: exactly one hit — `actions/exchanges.ts` in `updateReminderSettings` (retargeted in Task 8).

- [ ] **Step 3: Run the action suites**

Run: `pnpm vitest run actions/__tests__/`
Expected: PASS (including the two updated bulk assertions).

- [ ] **Step 4: Commit**

```bash
git add actions/applications-review.ts actions/forms.ts actions/submissions.ts actions/exchanges.ts actions/__tests__/bulk-applications.test.ts
git commit -m "chore(actions): drop revalidations of the deleted /exchanges pages"
```

---

### Task 8: Actions layer — relax `getProgramInfo`, add reminder fields, retarget revalidate

**Files:**
- Modify: `actions/settings.ts` (imports ~line 19, `ProgramInfo` type ~line 283, `getScopedExchange` ~line 289, `getProgramInfo` ~line 300)
- Modify: `actions/exchanges.ts` (last line of `updateReminderSettings`, ~line 270)
- Create: `actions/__tests__/settings.program.test.ts`

**Interfaces:**
- Consumes: `requireOrganizer(opts?: { orgRole?: 'owner' })` from `lib/auth/require` (via local `getOrganizerCtx`); `type ReminderCadence = 'douce' | 'normale' | 'insistante'` exported by `actions/exchanges.ts`.
- Produces: `ProgramInfo` gains `remindersEnabled: boolean` and `reminderCadence: ReminderCadence`; `getProgramInfo(exchangeId)` now succeeds for non-owner organizers. Task 9 relies on both.

- [ ] **Step 1: Write the failing tests**

Create `actions/__tests__/settings.program.test.ts` with exactly:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  orgRole: 'owner' | 'admin'
  exchange: Record<string, unknown> | null
}

// Mirrors lib/auth/require's contract: requesting orgRole 'owner' while the
// caller is an admin throws. getProgramInfo must no longer request it.
vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async (opts?: { orgRole?: 'owner' }) => {
    if (opts?.orgRole === 'owner' && scenario.orgRole !== 'owner') throw new Error('Unauthorized')
    return {
      user: { id: 'u1' },
      profile: { school_id: 's1', org_role: scenario.orgRole, email: 'a@b.c', full_name: 'A' },
    }
  },
}))

// Chainable, thenable query builder: count queries are awaited directly
// (then), row queries end in maybeSingle.
function table(result: { data?: unknown; count?: number }) {
  const b: any = {
    select: () => b, eq: () => b, not: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => ({ data: result.data ?? null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ count: result.count ?? 0 }),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return table({ data: scenario.exchange })
      if (t === 'exchange_enrollments') return table({ count: 10 })
      if (t === 'applications') return table({ count: 12 })
      return table({ data: null }) // form_templates deadline lookup
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getProgramInfo, archiveExchange } from '@/actions/settings'

beforeEach(() => {
  scenario = {
    orgRole: 'admin',
    exchange: {
      id: 'ex1', name: 'Programme Espagne', year: 2026, archived_at: null,
      school_a_id: 's1', school_b_id: 's2',
      reminders_enabled: null, reminder_cadence: null,
    },
  }
})

describe('getProgramInfo', () => {
  it('succeeds for a non-owner organizer', async () => {
    const info = await getProgramInfo('ex1')
    expect(info.name).toBe('Programme Espagne')
    expect(info.enrolled).toBe(10)
    expect(info.applications).toBe(12)
  })
  it('defaults reminder fields when the columns are null', async () => {
    const info = await getProgramInfo('ex1')
    expect(info.remindersEnabled).toBe(true)
    expect(info.reminderCadence).toBe('normale')
  })
  it('passes explicit reminder values through', async () => {
    scenario.exchange = { ...scenario.exchange!, reminders_enabled: false, reminder_cadence: 'insistante' }
    const info = await getProgramInfo('ex1')
    expect(info.remindersEnabled).toBe(false)
    expect(info.reminderCadence).toBe('insistante')
  })
  it('rejects an out-of-scope exchange', async () => {
    scenario.exchange = { ...scenario.exchange!, school_a_id: 's8', school_b_id: 's9' }
    await expect(getProgramInfo('ex1')).rejects.toThrow('Unauthorized')
  })
})

describe('archiveExchange', () => {
  it('still requires the owner role', async () => {
    await expect(archiveExchange('ex1')).rejects.toThrow('Unauthorized')
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm vitest run actions/__tests__/settings.program.test.ts`
Expected: FAIL — `succeeds for a non-owner organizer` rejects with `Unauthorized` (getProgramInfo still demands owner), and the two reminder-field tests fail on `undefined`. `archiveExchange still requires the owner role` may already pass — that's fine, it's the regression guard.

- [ ] **Step 3: Implement the action changes**

In `actions/settings.ts`:

(a) Add a type-only import next to the existing imports (after `import type Stripe from 'stripe'`):

```ts
import type { ReminderCadence } from './exchanges'
```

(b) Replace the `ProgramInfo` type:

```ts
export type ProgramInfo = {
  id: string; name: string; year: number; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
  remindersEnabled: boolean; reminderCadence: ReminderCadence
}
```

(c) In `getScopedExchange`, extend the select list:

```ts
    .select('id, name, year, archived_at, school_a_id, school_b_id, reminders_enabled, reminder_cadence')
```

(d) In `getProgramInfo`, drop the owner requirement:

```ts
  const ctx = await getOrganizerCtx()
```

(e) In `getProgramInfo`'s return, add the two fields:

```ts
  return {
    id: exchange.id, name: exchange.name, year: exchange.year,
    archived: !!exchange.archived_at,
    enrolled: enrolled ?? 0, applications: applications ?? 0,
    earliestDeadline: (firstDeadline?.deadline as string | null) ?? null,
    remindersEnabled: exchange.reminders_enabled ?? true,
    reminderCadence: (exchange.reminder_cadence ?? 'normale') as ReminderCadence,
  }
```

In `actions/exchanges.ts`, `updateReminderSettings`'s final line — the card now lives on /settings:

```ts
  revalidatePath('/settings')
```

Leave `archiveExchange` / `restoreExchange` untouched (`getOrganizerCtx({ orgRole: 'owner' })` stays).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/settings.program.test.ts actions/__tests__/exchanges.test.ts actions/__tests__/settings.locale.test.ts`
Expected: PASS (all three files — exchanges.test.ts doesn't assert the revalidate path).

- [ ] **Step 5: Commit**

```bash
git add actions/settings.ts actions/exchanges.ts actions/__tests__/settings.program.test.ts
git commit -m "feat(settings): getProgramInfo for all organizers, carries reminder fields"
```

---

### Task 9: Settings UI — Programme section for everyone, with the reminder card

**Files:**
- Modify: `components/settings/ProgramCard.tsx` (props, reminder card, danger zone/modal gating)
- Modify: `components/settings/SettingsView.tsx` (nav gate ~line 32, prog render ~line 66)
- Modify: `app/(organizer)/settings/page.tsx` (fetch program for all organizers, lines 27–38)
- Modify: `components/settings/__tests__/SettingsView.test.tsx`
- Modify: `CLAUDE.md` (Automated Reminders section, one sentence)

**Interfaces:**
- Consumes: `ProgramInfo` with `remindersEnabled: boolean`, `reminderCadence: ReminderCadence` (Task 8); `ReminderSettingsCard` from `components/exchanges/ReminderSettingsCard.tsx` with props `{ exchangeId: string; initialEnabled: boolean; initialCadence: ReminderCadence; readOnly: boolean }` (unchanged, reused as-is).
- Produces: `ProgramCard` prop signature becomes `{ program: ProgramInfo; isOwner: boolean }`; it renders the reminder card between the stats row and the (owner-only) archive zone. Programme section visible whenever `program !== null`, regardless of role.

- [ ] **Step 1: Write the failing tests**

In `components/settings/__tests__/SettingsView.test.tsx`:

(a) After the existing `vi.mock('@/actions/settings', …)` block (ends line 17), add a mock for the reminder card's action module:

```tsx
vi.mock('@/actions/exchanges', () => ({
  updateReminderSettings: vi.fn().mockResolvedValue(undefined),
}))
```

(b) In the `owner` fixture, extend `program`:

```tsx
  program: {
    id: 'ex1', name: 'Programme Espagne', year: 2026, archived: false,
    enrolled: 10, applications: 12, earliestDeadline: '2026-10-10',
    remindersEnabled: true, reminderCadence: 'normale' as const,
  },
```

(c) Append a new describe block at the end of the file:

```tsx
describe('SettingsView — Programme for all organizers', () => {
  it('admin with an active program sees Programme + reminders, no billing, no danger zone', () => {
    render(<SettingsView {...baseProps} program={owner.program} />)
    expect(screen.queryByRole('button', { name: 'Facturation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('Rappels automatiques')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Normale/ })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Archiver le programme…' })).toBeNull()
  })

  it('owner sees both the reminder card and the archive zone', () => {
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('Rappels automatiques')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archiver le programme…' })).toBeInTheDocument()
  })

  it('archived program renders the reminder card read-only', () => {
    render(<SettingsView {...owner} program={{ ...owner.program, archived: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('Programme archivé — lecture seule.')).toBeInTheDocument()
  })
})
```

(The existing test `admin sees only Compte + Équipe in the nav` keeps passing: `baseProps.program` is `null`, so the Programme entry stays hidden for it. The FR strings `Rappels automatiques` and `Programme archivé — lecture seule.` are the existing `organizer.exchanges.reminders.heading` / `.readOnlyNotice` values.)

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `pnpm vitest run components/settings/__tests__/SettingsView.test.tsx`
Expected: the 3 new tests FAIL (no `Programme` nav button for admin; no `Rappels automatiques` text). Pre-existing tests PASS.

- [ ] **Step 3: Implement the UI changes**

(a) `components/settings/ProgramCard.tsx` — add the import:

```tsx
import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'
```

Change the signature (line 7):

```tsx
export function ProgramCard({ program, isOwner }: { program: ProgramInfo; isOwner: boolean }) {
```

Between the stats box (the `<div className="flex items-center justify-between gap-4 rounded-xl border border-subtle …">…</div>` block) and the danger zone, insert the reminder card (spec: above the archive zone):

```tsx
      <div className="mt-4">
        <ReminderSettingsCard
          exchangeId={program.id}
          initialEnabled={program.remindersEnabled}
          initialCadence={program.reminderCadence}
          readOnly={program.archived}
        />
      </div>
```

Wrap the danger zone AND the modal in an owner gate. The danger-zone block and the `{modal && (…)}` block become (inner content byte-identical to today — only the `{isOwner && …}` wrappers are new):

```tsx
      {isOwner && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-danger bg-danger/40 px-[18px] py-4">
          <div>
            <div className="text-[13.5px] font-semibold text-danger-text">{t('settings.program.archiveHeading')}</div>
            <div className="mt-0.5 text-[12.5px] leading-normal text-danger-text/70">
              {t('settings.program.archiveDescription')}
            </div>
          </div>
          {program.archived ? (
            <button
              type="button" disabled={busy} onClick={() => run(() => restoreExchange(program.id))}
              className="flex-none rounded-[9px] border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow disabled:opacity-50"
            >
              {t('settings.program.restoreButton')}
            </button>
          ) : (
            <button
              type="button" onClick={() => setModal(true)}
              className="flex-none rounded-[9px] border border-danger bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-danger disabled:opacity-50"
            >
              {t('settings.program.archiveButton')}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger-text">{error}</p>}

      {isOwner && modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rail/50" role="dialog" aria-modal="true">
          <div className="w-[460px] max-w-[calc(100vw-32px)] rounded-[18px] bg-card p-[30px] shadow-modal">
            <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl bg-danger font-display text-xl font-bold text-danger-text">!</div>
            <div className="mb-2 font-display text-[19px] font-bold tracking-[-.01em] text-foreground">{t('settings.program.modal.title')}</div>
            <p className="mb-[22px] text-[13.5px] leading-[1.55] text-muted-foreground">
              {t('settings.program.modal.body', { name: `${program.name} · ${program.year}` })}
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button" onClick={() => setModal(false)}
                className="rounded-[9px] border px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-hoverrow"
              >
                {c('actions.cancel')}
              </button>
              <button
                type="button" disabled={busy}
                onClick={() => { setModal(false); void run(() => archiveExchange(program.id)) }}
                className="rounded-[9px] bg-danger-text px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t('settings.program.modal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
```

The heading and stats box at the top of the component are untouched.

(b) `components/settings/SettingsView.tsx`:

Nav gate (line 32) — drop the owner condition:

```tsx
    ...(props.program ? [{ key: 'prog' as const, label: t('settings.nav.prog') }] : []),
```

Prog section render (line 66) becomes:

```tsx
          {section === 'prog' && props.program && <ProgramCard program={props.program} isOwner={props.isOwner} />}
```

(c) `app/(organizer)/settings/page.tsx` — replace the owner-gated fetch block (lines 27–38) so program info loads for every organizer while billing stays owner-only:

```tsx
  let billing: BillingOverview | null = null
  if (isOwner) billing = await getBillingOverview()

  let program: ProgramInfo | null = null
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(
    exchanges.map((e: any) => ({ ...e, archived: !!e.archived_at })),
    cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value,
  )
  if (active) program = await getProgramInfo(active.id)
```

(Imports on this page already cover everything used.)

(d) `CLAUDE.md`, Automated Reminders section: replace `organizers pick a preset on the exchange detail page` with `organizers pick a preset in Settings → Programme`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/settings/__tests__/SettingsView.test.tsx components/exchanges/__tests__/ReminderSettingsCard.test.tsx`
Expected: PASS (all tests, both files).

- [ ] **Step 5: Commit**

```bash
git add components/settings/ProgramCard.tsx components/settings/SettingsView.tsx "app/(organizer)/settings/page.tsx" components/settings/__tests__/SettingsView.test.tsx CLAUDE.md
git commit -m "feat(settings): Programme section for all organizers with reminder settings card"
```

---

### Task 10: History-back navigation from submission review

**Files:**
- Create: `components/HistoryBackLink.tsx`
- Modify: `components/SubmissionReview.tsx` (drop `exchangeId`, `router.back()`)
- Modify: `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx` (back control, imports, props)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json` (reword `organizer.pages.submissionReview.backLink`)
- Create: `components/__tests__/SubmissionReview.test.tsx`

**Interfaces:**
- Consumes: `approveSubmission(assignmentId)` / `rejectSubmission(assignmentId, note)` from `actions/submissions` (unchanged; their `/documents` + `/students` revalidations from Task 7 keep the history-back origin fresh).
- Produces: `SubmissionReview` props become `{ assignmentId: string }` (the `exchangeId` prop disappears — this page is its only consumer); `HistoryBackLink` is a client component `{ label: string }` rendering a ghost-button that calls `router.back()`.

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/SubmissionReview.test.tsx` with exactly:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const back = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push: vi.fn(), refresh: vi.fn() }) }))
const approveSubmission = vi.fn().mockResolvedValue(undefined)
const rejectSubmission = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/submissions', () => ({
  approveSubmission: (...a: unknown[]) => approveSubmission(...a),
  rejectSubmission: (...a: unknown[]) => rejectSubmission(...a),
}))

import { SubmissionReview } from '@/components/SubmissionReview'

describe('SubmissionReview', () => {
  beforeEach(() => { back.mockClear(); approveSubmission.mockClear(); rejectSubmission.mockClear() })

  it('approve returns via history-back', async () => {
    render(<SubmissionReview assignmentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(back).toHaveBeenCalled())
    expect(approveSubmission).toHaveBeenCalledWith('a1')
  })

  it('confirmed reject returns via history-back', async () => {
    render(<SubmissionReview assignmentId="a1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByLabelText('Rejection note (required)'), { target: { value: 'Fix it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reject' }))
    await waitFor(() => expect(back).toHaveBeenCalled())
    expect(rejectSubmission).toHaveBeenCalledWith('a1', 'Fix it')
  })
})
```

(This component's inline strings are historical English — assert them as-is.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run components/__tests__/SubmissionReview.test.tsx`
Expected: FAIL — the component requires the `exchangeId` prop (TS) and calls `router.push`, so `back` is never called.

- [ ] **Step 3: Implement**

(a) Create `components/HistoryBackLink.tsx`:

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// History-back control for pages reachable from several origins (Documents
// drawer, Student detail) where no static back href exists.
export function HistoryBackLink({ label }: { label: string }) {
  const router = useRouter()
  return (
    <Button variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground" onClick={() => router.back()}>
      {label}
    </Button>
  )
}
```

(b) In `components/SubmissionReview.tsx`, change the signature and both handlers:

```tsx
export function SubmissionReview({ assignmentId }: { assignmentId: string }) {
```

In `handleApprove`, replace `router.push(\`/exchanges/${exchangeId}\`)` with:

```tsx
      router.back()
```

In `handleReject`, replace `router.push(\`/exchanges/${exchangeId}\`)` with:

```tsx
      router.back()
```

(c) In `app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx`:

- Remove the `import Link from 'next/link'` and `import { Button } from '@/components/ui/button'` lines; add:

```tsx
import { HistoryBackLink } from '@/components/HistoryBackLink'
```

- Destructure only what's used (the route still carries `id`, the page no longer needs it):

```tsx
  const { assignmentId } = await params
```

(keep the `params: Promise<{ id: string; assignmentId: string }>` type — the segment provides both.)

- Replace the back-link block:

```tsx
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground">
        <Link href={`/exchanges/${exchangeId}`}>{t('pages.submissionReview.backLink')}</Link>
      </Button>
```

with:

```tsx
      <HistoryBackLink label={t('pages.submissionReview.backLink')} />
```

- Replace `<SubmissionReview assignmentId={assignmentId} exchangeId={exchangeId} />` with:

```tsx
        <SubmissionReview assignmentId={assignmentId} />
```

(d) Reword `organizer.pages.submissionReview.backLink` in all 5 locales — the destination is now "wherever you came from", not the exchange:

| file | old | new |
|---|---|---|
| `messages/en.json` | `← Back to exchange` | `← Back` |
| `messages/fr.json` | `← Retour à l’échange` | `← Retour` |
| `messages/es.json` | `← Volver al intercambio` | `← Volver` |
| `messages/it.json` | `← Torna allo scambio` | `← Indietro` |
| `messages/de.json` | `← Zurück zum Austausch` | `← Zurück` |

- [ ] **Step 4: Run the tests + check no dangling references**

Run: `pnpm vitest run components/__tests__/SubmissionReview.test.tsx messages/__tests__/parity.test.ts && npx tsc --noEmit`
Expected: PASS, tsc silent.

```bash
grep -rn "exchangeId" components/SubmissionReview.tsx "app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/HistoryBackLink.tsx components/SubmissionReview.tsx "app/(organizer)/exchanges/[id]/submissions/[assignmentId]/page.tsx" messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json components/__tests__/SubmissionReview.test.tsx
git commit -m "feat(review): submission review returns via history-back"
```

---

### Task 11: Full verification gate + finish

**Files:** none new — whole-branch verification.

- [ ] **Step 1: Run the gate**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: lint clean, full vitest suite green, tsc silent. (Known hazard from memory: a main-checkout `pnpm test` can sweep other sessions' `.claude/worktrees/*` test files — failures from paths outside this branch are pre-existing noise; confirm the failing file's path before touching anything.)

- [ ] **Step 2: Residual-reference sweep**

```bash
grep -rn "'/exchanges'\|\"/exchanges\"\|href=\"/exchanges\"" app components actions lib --include="*.ts*" | grep -v ".claude" | grep -v robots
```

Expected: only hits under `/exchanges/[id]/…` deep URLs (DocDrawer + StudentDetail submission links, `apply.ts` reviewUrl, `applications-review.ts` subroute revalidations) — no reference to the deleted index pages. `app/robots.ts` still contains the `/exchanges` disallow.

- [ ] **Step 3: Manual spot-check list (report, don't block)**

Note in the final report for Bjorn's browser pass:
- Exchange dropdown: first open shows rows instantly, second lines (« 12 / 18 dossiers validés ») appear when data lands; switching works even if the count fetch fails.
- Rail: no Échanges tab; on a submission-review page no rail item is highlighted (same as /settings).
- Settings → Programme as **admin** (non-owner): section visible, reminder card editable, no archive zone, no Facturation.
- Settings → Programme as **owner**: stats + reminder card + archive zone; archived exchange → reminder card read-only.
- Documents drawer → open a submission → approve → lands back on Documents with fresh status; same from Student detail.
- Old `/exchanges` and `/exchanges/<id>` URLs now 404 (expected).

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch — push the branch and open a PR to `main` (merge-commit merge, per project convention). Do not merge or push `main`.
