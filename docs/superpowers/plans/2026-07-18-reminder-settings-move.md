# Reminder Settings → Settings/Programme Implementation Plan

> **SUPERSEDED (2026-07-18, never executed):** folded into
> `2026-07-18-remove-exchanges-tab.md` (its Tasks 8–9). Task 3 here conflicts
> with the newer spec (ExchangesView is deleted, not repurposed). Do not execute.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the per-exchange automatic-reminder settings from the near-empty `/exchanges/[id]` page into Settings → Programme (visible to all organizers), and make exchange cards on `/exchanges` switch the active exchange instead of linking to the deleted page.

**Architecture:** `getProgramInfo` (actions/settings.ts) relaxes from owner-only to any organizer and carries the exchange's reminder fields; `SettingsView` renders the existing `ReminderSettingsCard` inside the Programme section (archive danger zone stays owner-only in `ProgramCard`); `ExchangesView` cards reuse the `SessionSelector` pattern (`setActiveExchange` + push to `/dashboard`); `app/(organizer)/exchanges/[id]/page.tsx` is deleted (subroutes stay).

**Tech Stack:** Next.js 14 App Router, Server Actions, next-intl, Tailwind, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-18-reminder-settings-move-design.md`

## Global Constraints

- Package manager is **pnpm**. Test runner: `pnpm vitest run <file>` for single files, `pnpm test` for the suite.
- Work on branch **`feature/reminder-settings-move`** (create in Task 1; use a git worktree per superpowers:using-git-worktrees if executing with subagents — other sessions share this checkout).
- **No new i18n keys.** The reminder card keeps its `organizer.exchanges.reminders.*` keys (all 5 locales already have them). Do not edit any `messages/*.json`.
- **No DB migration, no RLS change** → `pnpm test:rls` not required.
- `pnpm build` fails locally (placeholder env) — use `npx tsc --noEmit` for type checking.
- Server-side owner checks on `archiveExchange`/`restoreExchange` must NOT be touched — only `getProgramInfo` relaxes.
- Stage only the files named in each task's commit step (never `git add -A` — PII risk from untracked files).
- FR strings used in test assertions are exact and copied from `messages/fr.json` — do not "fix" accents or ellipses (`Archiver le programme…` uses the single-char ellipsis `…`).

---

### Task 1: Actions layer — relax `getProgramInfo`, add reminder fields, retarget revalidate

**Files:**
- Modify: `actions/settings.ts` (imports ~line 19, `ProgramInfo` type ~line 283, `getScopedExchange` ~line 289, `getProgramInfo` ~line 300)
- Modify: `actions/exchanges.ts` (last line of `updateReminderSettings`, ~line 270)
- Create: `actions/__tests__/settings.program.test.ts`

**Interfaces:**
- Consumes: `requireOrganizer(opts?: { orgRole?: 'owner' })` from `lib/auth/require` (already exists, via local `getOrganizerCtx`); `type ReminderCadence = 'douce' | 'normale' | 'insistante'` exported by `actions/exchanges.ts`.
- Produces: `ProgramInfo` gains `remindersEnabled: boolean` and `reminderCadence: ReminderCadence`; `getProgramInfo(exchangeId)` now succeeds for non-owner organizers. Task 2 relies on both.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --rebase && git checkout -b feature/reminder-settings-move
```

(If `git pull --rebase` fails on DNS, see memory: point `/etc/resolv.conf` at 8.8.8.8 — or continue from local main; this branch merges via PR anyway.)

- [ ] **Step 2: Write the failing tests**

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

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `pnpm vitest run actions/__tests__/settings.program.test.ts`
Expected: FAIL — `succeeds for a non-owner organizer` rejects with `Unauthorized` (getProgramInfo still demands owner), and the two reminder-field tests fail on `undefined`. `archiveExchange still requires the owner role` may already pass — that's fine, it's the regression guard.

- [ ] **Step 4: Implement the action changes**

In `actions/settings.ts`:

(a) Add a type-only import next to the existing imports (after line 19, `import type Stripe from 'stripe'`):

```ts
import type { ReminderCadence } from './exchanges'
```

(b) Replace the `ProgramInfo` type (currently lines 283–286):

```ts
export type ProgramInfo = {
  id: string; name: string; year: number; archived: boolean
  enrolled: number; applications: number; earliestDeadline: string | null
  remindersEnabled: boolean; reminderCadence: ReminderCadence
}
```

(c) In `getScopedExchange`, extend the select list (line 292):

```ts
    .select('id, name, year, archived_at, school_a_id, school_b_id, reminders_enabled, reminder_cadence')
```

(d) In `getProgramInfo`, drop the owner requirement (line 302):

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

In `actions/exchanges.ts`, `updateReminderSettings`'s final line (270) — the card now lives on /settings:

```ts
  revalidatePath('/settings')
```

Leave `archiveExchange` / `restoreExchange` untouched (`getOrganizerCtx({ orgRole: 'owner' })` stays).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run actions/__tests__/settings.program.test.ts actions/__tests__/exchanges.test.ts actions/__tests__/settings.locale.test.ts`
Expected: PASS (all three files — exchanges.test.ts doesn't assert the revalidate path, settings.locale.test.ts guards the shared module still imports).

- [ ] **Step 6: Commit**

```bash
git add actions/settings.ts actions/exchanges.ts actions/__tests__/settings.program.test.ts
git commit -m "feat(settings): getProgramInfo for all organizers, carries reminder fields"
```

---

### Task 2: Settings UI — Programme section for everyone, with the reminder card

**Files:**
- Modify: `components/settings/ProgramCard.tsx` (props + danger zone/modal gating)
- Modify: `components/settings/SettingsView.tsx` (nav gate ~line 32, prog render ~line 66, import)
- Modify: `app/(organizer)/settings/page.tsx` (fetch program for all organizers, lines 27–38)
- Modify: `components/settings/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `ProgramInfo` with `remindersEnabled: boolean`, `reminderCadence: ReminderCadence` (Task 1); `ReminderSettingsCard` from `components/exchanges/ReminderSettingsCard.tsx` with props `{ exchangeId: string; initialEnabled: boolean; initialCadence: ReminderCadence; readOnly: boolean }` (unchanged, reused as-is).
- Produces: `ProgramCard` prop signature becomes `{ program: ProgramInfo; isOwner: boolean }`. Settings Programme section visible whenever `program !== null`, regardless of role.

- [ ] **Step 1: Write the failing tests**

In `components/settings/__tests__/SettingsView.test.tsx`:

(a) After the existing `vi.mock('@/actions/settings', …)` block (ends line 17), add a mock for the reminder card's action module:

```tsx
vi.mock('@/actions/exchanges', () => ({
  updateReminderSettings: vi.fn().mockResolvedValue(undefined),
}))
```

(b) In the `owner` fixture, extend `program` (currently lines 113–116):

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

(The existing test `admin sees only Compte + Équipe in the nav` keeps passing: `baseProps.program` is `null`, so the Programme entry stays hidden for it.)

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `pnpm vitest run components/settings/__tests__/SettingsView.test.tsx`
Expected: the 3 new tests FAIL (no `Programme` nav button for admin; no `Rappels automatiques` text). Pre-existing tests PASS.

- [ ] **Step 3: Implement the UI changes**

(a) `components/settings/ProgramCard.tsx` — change the signature (line 7):

```tsx
export function ProgramCard({ program, isOwner }: { program: ProgramInfo; isOwner: boolean }) {
```

Wrap the danger zone AND the modal in an owner gate. The danger-zone block (lines 44–66) and the `{modal && (…)}` block (lines 69–94) become (inner content byte-identical to today — only the `{isOwner && …}` wrappers are new):

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

The stats card at the top of the component is untouched.

(b) `components/settings/SettingsView.tsx`:

Add the import:

```tsx
import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'
```

Nav gate (line 32) — drop the owner condition:

```tsx
    ...(props.program ? [{ key: 'prog' as const, label: t('settings.nav.prog') }] : []),
```

Prog section render (line 66) becomes:

```tsx
          {section === 'prog' && props.program && (
            <>
              <ProgramCard program={props.program} isOwner={props.isOwner} />
              <ReminderSettingsCard
                exchangeId={props.program.id}
                initialEnabled={props.program.remindersEnabled}
                initialCadence={props.program.reminderCadence}
                readOnly={props.program.archived}
              />
            </>
          )}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run components/settings/__tests__/SettingsView.test.tsx components/exchanges/__tests__/ReminderSettingsCard.test.tsx`
Expected: PASS (all tests, both files).

- [ ] **Step 5: Commit**

```bash
git add components/settings/ProgramCard.tsx components/settings/SettingsView.tsx "app/(organizer)/settings/page.tsx" components/settings/__tests__/SettingsView.test.tsx
git commit -m "feat(settings): Programme section for all organizers with reminder settings card"
```

---

### Task 3: Exchange cards switch the active exchange; delete the detail page

**Files:**
- Modify: `components/exchanges/ExchangesView.tsx` (`ExchangeCard`, lines 14–38 + imports)
- Delete: `app/(organizer)/exchanges/[id]/page.tsx`
- Modify: `components/exchanges/__tests__/ExchangesView.test.tsx`

**Interfaces:**
- Consumes: `setActiveExchange(exchangeId: string): Promise<void>` from `actions/session` (sets the `ee_active_exchange` cookie and revalidates the layout — same call `SessionSelector` uses).
- Produces: nothing downstream. `/exchanges/[id]` index route ceases to exist; subroutes (`applications/`, `forms/`, `submissions/`) and `[id]/loading.tsx` remain (the loading skeleton is imported by `app/__tests__/organizer-loading-skeletons.test.tsx` — do NOT delete it).

- [ ] **Step 1: Rewrite the test file with the new card behavior**

Replace the entire content of `components/exchanges/__tests__/ExchangesView.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const setActiveExchange = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/session', () => ({ setActiveExchange: (...a: unknown[]) => setActiveExchange(...a) }))
import { ExchangesView } from '@/components/exchanges/ExchangesView'

const ex = { id: 'e1', name: 'France–Canada 2026', year: 2026, pct: 40, pctLabel: '2 / 5 candidatures traitées' }

describe('ExchangesView', () => {
  beforeEach(() => { push.mockClear(); setActiveExchange.mockClear() })

  it('renders no billing block', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.queryByText(/Essai gratuit/)).toBeNull()
    expect(screen.queryByText('POPULAIRE')).toBeNull()
    expect(screen.queryByText(/Forfait/)).toBeNull()
  })
  it('exchange card shows name, year and progress', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('clicking a card activates the exchange and goes to the dashboard', async () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.queryByRole('link', { name: /France–Canada 2026/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(setActiveExchange).toHaveBeenCalledWith('e1')
  })
  it('under cap: create button opens the modal (no /billing link)', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap={false} />)
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nouvel échange/ })).toBeNull()
  })
  it('at cap: create button is a silent link to /billing', () => {
    renderWithIntl(<ExchangesView exchangesData={[ex]} atCap />)
    expect(screen.queryByRole('button', { name: /Nouvel échange/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nouvel échange/ })).toHaveAttribute('href', '/billing')
  })
})
```

- [ ] **Step 2: Run it to verify the new test fails**

Run: `pnpm vitest run components/exchanges/__tests__/ExchangesView.test.tsx`
Expected: `clicking a card activates the exchange…` FAILS (card is still a link). The other tests PASS.

- [ ] **Step 3: Implement the card change**

In `components/exchanges/ExchangesView.tsx`, replace the imports (lines 1–4) and `ExchangeCard` (lines 14–38) with:

```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setActiveExchange } from '@/actions/session'
import { useShellUi } from '@/components/shell/ShellUiContext'
```

```tsx
function ExchangeCard({ exchange }: { exchange: ExchangeCardData }) {
  const { id, name, year, pct, pctLabel } = exchange
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // Opening an exchange = making it the active one (same as the shell's
  // SessionSelector); every organizer page derives from the cookie.
  async function open() {
    if (busy) return
    setBusy(true)
    await setActiveExchange(id)
    router.push('/dashboard')
  }

  return (
    <button
      type="button" onClick={open} disabled={busy}
      className="bg-card border rounded-[14px] p-5 hover:bg-hoverrow-soft flex flex-col text-left disabled:opacity-70"
    >
      <div className="flex items-center gap-2.5">
        <span className="font-display text-base font-bold text-navy">{name}</span>
        <span className="rounded-pill bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {year}
        </span>
      </div>
      <div className="text-[13px] text-muted-foreground mt-1">{pctLabel}</div>
      {pct !== null && (
        <>
          <div className="h-[8px] rounded-pill bg-track mt-2.5 w-full">
            <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[12px] text-muted-foreground mt-1">{pct}%</div>
        </>
      )}
    </button>
  )
}
```

(`Link` stays imported — the at-cap `/billing` CTA below still uses it. Note the progress track gains `w-full`: block divs stretched inside the old `Link`; inside a `button` flex column they need it explicitly.)

- [ ] **Step 4: Delete the exchange detail page**

```bash
git rm "app/(organizer)/exchanges/[id]/page.tsx"
```

Keep `app/(organizer)/exchanges/[id]/loading.tsx` and every subdirectory.

- [ ] **Step 5: Run the tests + check nothing referenced the page**

Run: `pnpm vitest run components/exchanges/__tests__/ExchangesView.test.tsx app/__tests__/organizer-loading-skeletons.test.tsx`
Expected: PASS.

Run: `grep -rn "exchanges/\[id\]/page" app components actions lib --include="*.ts*"`
Expected: no output (nothing imports the deleted page).

- [ ] **Step 6: Commit**

```bash
git add components/exchanges/ExchangesView.tsx components/exchanges/__tests__/ExchangesView.test.tsx
git commit -m "feat(exchanges): cards switch the active exchange; drop empty detail page"
```

(`git rm` already staged the deletion.)

---

### Task 4: Full verification gate

**Files:** none new — whole-branch verification.

- [ ] **Step 1: Run the gate**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```

Expected: lint clean, full vitest suite green, tsc silent. (Known hazard from memory: the main-checkout `pnpm test` can sweep other sessions' `.claude/worktrees/*` test files — failures from files outside this branch's paths are pre-existing noise; confirm by checking the failing file's path before touching anything.)

- [ ] **Step 2: Manual spot-check list (report, don't block)**

Note in the final report for Bjorn's browser pass:
- Settings → Programme as **admin** (non-owner): section visible, reminder card editable, no archive zone.
- Settings → Programme as **owner**: stats + reminder card + archive zone.
- `/exchanges`: clicking a card switches the header's active exchange and lands on the dashboard.
- Old `/exchanges/<id>` URL now 404s (expected).

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch — push the branch and open a PR to `main` (merge-commit merge, per project convention). Do not merge or push `main`.
