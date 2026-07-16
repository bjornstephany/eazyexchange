# Dashboard Empty-Rollup Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Aperçu from showing « Reçu » / « Complet » / « Complet » for students with no form/document templates assigned — introduce a `'none'` rollup state rendered as a neutral « — » pill, and exclude empty dossiers from every "complete" counter.

**Architecture:** All changes live in the pure derivation module `lib/dashboard/rollup.ts` and its test file; every consumer (Aperçu table, funnel, filters, Échanges card, student directory, StudentDrawer) inherits the fix through the existing exports. TypeScript exhaustive switches in the pill helpers turn any missed `'none'` handling into a compile error.

**Tech Stack:** TypeScript, vitest, next-intl (`createTranslator` in tests). Spec: `docs/superpowers/specs/2026-07-16-dashboard-empty-rollup-design.md`.

## Global Constraints

- **No new translation keys.** The « — » label is the existing `organizer.dashboard.pills.dash` key (present in all 5 locale files).
- Package manager is **pnpm** (never npm).
- No migration, no RLS impact, no storage change → `pnpm test:rls` NOT required.
- `pnpm build` fails locally (placeholder envs in `.env.local`) — the type gate is `npx tsc --noEmit` instead.
- This repo allows confident bug fixes committed straight to `main`. **Before every commit, run `git branch --show-current` and confirm it prints `main`** (concurrent sessions share this working dir and have moved HEAD before). Never `git push` — that stays with Bjorn.
- Stage only the named files (`git add <file> <file>`), never `git add -A`.
- French label strings in tests are asserted byte-for-byte (e.g. `'—'` is U+2014 em dash, `'Complet'`, `'À vérifier'`).

---

### Task 1: `'none'` rollup state, neutral pills, honest overall

**Files:**
- Modify: `lib/dashboard/rollup.ts` (types at lines 24–31; `rollupStudent` at 69–109; `formsPill` at 111–117; `docsPill` at 119–126; new `dossierComplete` helper)
- Test: `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: nothing new — existing module internals.
- Produces (Task 2 relies on these exactly):
  - `DossierRollup['forms']` union becomes `'complete' | 'pending' | 'missing' | 'none'`
  - `DossierRollup['docs']` union becomes `'complete' | 'review' | 'pending' | 'missing' | 'none'`
  - `export function dossierComplete(r: Pick<DossierRollup, 'forms' | 'docs'>): boolean` — true iff every side is `'complete'` or `'none'` and at least one side is not `'none'`.

- [ ] **Step 1: Update the stale test and write the new failing tests**

In `lib/dashboard/__tests__/rollup.test.ts`:

(a) Add `dossierComplete` and the `DossierRollup` type to the import block (lines 4–11):

```ts
import {
  frShortDate,
  rollupStudent, formsPill, docsPill, dossierComplete,
  timelineFor, nextDeadline, p,
  candidaturePill, applicantStatusPill, buildLifecycleRows, closedCount,
  lifecycleFunnel, lifecycleFilter, lifecycleSubline, lifecycleActionCards, exchangeProgress,
  type AppRow, type TemplateInfo, type CellMap, type EnrolledStudent, type DossierRollup,
} from '@/lib/dashboard/rollup'
```

(b) REPLACE the existing test at lines 52–55 (`it('no templates → complete', …)`) with:

```ts
  it('no templates → none/none with neutral « — » overall', () => {
    const r = rollupStudent(student, [], {}, TODAY, t)
    expect(r.forms).toBe('none'); expect(r.docs).toBe('none')
    expect(r.overall).toEqual({ kind: 'neutral', label: '—' })
    expect(r.due).toBeNull(); expect(r.late).toBe(false)
  })
  it('forms-only exchange, all forms approved → docs none, overall Complet', () => {
    const TF: TemplateInfo[] = [{ id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' }]
    const r = rollupStudent(student, TF, { 's1:f1': { assignmentId: 'a1', status: 'approved' } }, TODAY, t)
    expect(r.forms).toBe('complete'); expect(r.docs).toBe('none')
    expect(r.overall).toEqual({ kind: 'ok', label: 'Complet' })
  })
  it('docs-only exchange, nothing started → forms none, overall stays incomplete (warn)', () => {
    const TD: TemplateInfo[] = [{ id: 'd1', type: 'document_upload', name: 'Passeport', deadline: '2026-10-10' }]
    const r = rollupStudent(student, TD, cell(undefined, ''), TODAY, t)
    expect(r.forms).toBe('none'); expect(r.docs).toBe('missing')
    expect(r.overall.kind).toBe('warn')
  })
```

(c) In the `describe('formsPill / docsPill')` block (lines 87–95), add a `'none'` row to EACH `it.each` table:

```ts
describe('formsPill / docsPill', () => {
  it.each([
    ['complete', 'ok', 'Reçu'], ['pending', 'warn', 'En cours'], ['missing', 'bad', 'Manquant'],
    ['none', 'neutral', '—'],
  ])('formsPill %s → %s %s', (s, kind, label) => expect(formsPill(s as any, t)).toEqual({ kind, label }))
  it.each([
    ['complete', 'ok', 'Complet'], ['review', 'info', 'À vérifier'],
    ['pending', 'warn', 'En cours'], ['missing', 'bad', 'Manquant'],
    ['none', 'neutral', '—'],
  ])('docsPill %s → %s %s', (s, kind, label) => expect(docsPill(s as any, t)).toEqual({ kind, label }))
})
```

(d) Add a new describe block after `describe('formsPill / docsPill')`:

```ts
describe('dossierComplete', () => {
  const mk = (forms: DossierRollup['forms'], docs: DossierRollup['docs']) => ({ forms, docs })
  it('true when everything requested is complete', () => {
    expect(dossierComplete(mk('complete', 'complete'))).toBe(true)
    expect(dossierComplete(mk('complete', 'none'))).toBe(true)
    expect(dossierComplete(mk('none', 'complete'))).toBe(true)
  })
  it('false when nothing was requested at all', () => {
    expect(dossierComplete(mk('none', 'none'))).toBe(false)
  })
  it('false while anything requested is unfinished', () => {
    expect(dossierComplete(mk('pending', 'none'))).toBe(false)
    expect(dossierComplete(mk('complete', 'review'))).toBe(false)
    expect(dossierComplete(mk('missing', 'missing'))).toBe(false)
    expect(dossierComplete(mk('none', 'pending'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `dossierComplete` is not exported (import error), or after partial edits: `expected 'complete' to be 'none'` and the two pill `'none'` rows failing with `undefined`.

- [ ] **Step 3: Implement in `lib/dashboard/rollup.ts`**

(a) Widen the two unions in the `DossierRollup` type (lines 24–31):

```ts
export type DossierRollup = {
  studentId: string; name: string
  forms: 'complete' | 'pending' | 'missing' | 'none'
  docs: 'complete' | 'review' | 'pending' | 'missing' | 'none'
  due: string | null   // ISO date of earliest incomplete deadline
  late: boolean
  overall: Pill
}
```

(b) Add the helper right after the `sameDate` function (after line 67), before `rollupStudent`:

```ts
// A dossier is complete once everything actually requested is done. A student
// with no templates at all ('none'/'none') is NOT complete — nothing was sent,
// there is nothing to be complete about (the Aperçu shows « — » instead).
export function dossierComplete(r: Pick<DossierRollup, 'forms' | 'docs'>): boolean {
  if (r.forms === 'none' && r.docs === 'none') return false
  return (r.forms === 'complete' || r.forms === 'none') && (r.docs === 'complete' || r.docs === 'none')
}
```

(c) In `rollupStudent`, change the zero-template branches (lines 77–81 and 85–90) from `'complete'` to `'none'`:

```ts
  const forms: DossierRollup['forms'] =
    dataTemplates.length === 0 ? 'none'
    : formsStates.every(s => s === 'done' || s === 'awaiting') ? 'complete'
    : formsStarted.every(started => !started) ? 'missing'
    : 'pending'
```

```ts
  const docs: DossierRollup['docs'] =
    docTemplates.length === 0 ? 'none'
    : docsStates.some(s => s === 'awaiting') ? 'review'
    : docsStates.every(s => s === 'done') ? 'complete'
    : docsStarted.every(started => !started) ? 'missing'
    : 'pending'
```

(d) Replace the `overall` derivation (lines 102–106):

```ts
  let overall: Pill
  if (forms === 'none' && docs === 'none') overall = { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  else if (docs === 'review') overall = { kind: 'info', label: t('common.status.toVerify') }
  else if (dossierComplete({ forms, docs })) overall = { kind: 'ok', label: t('organizer.students.overall.complete') }
  else if (late) overall = { kind: 'bad', label: t('organizer.students.overall.late') }
  else overall = { kind: 'warn', label: t('organizer.students.overall.incomplete') }
```

(e) Add the `'none'` case to both pill helpers (exhaustive switches — tsc fails without them):

```ts
export function formsPill(f: DossierRollup['forms'], t: T): Pill {
  switch (f) {
    case 'complete': return { kind: 'ok', label: t('common.status.received') }
    case 'pending': return { kind: 'warn', label: t('common.status.inProgress') }
    case 'missing': return { kind: 'bad', label: t('common.status.missing') }
    case 'none': return { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  }
}
```

```ts
export function docsPill(d: DossierRollup['docs'], t: T): Pill {
  switch (d) {
    case 'complete': return { kind: 'ok', label: t('organizer.dashboard.pills.complete') }
    case 'review': return { kind: 'info', label: t('common.status.toVerify') }
    case 'pending': return { kind: 'warn', label: t('common.status.inProgress') }
    case 'missing': return { kind: 'bad', label: t('common.status.missing') }
    case 'none': return { kind: 'neutral', label: t('organizer.dashboard.pills.dash') }
  }
}
```

Do NOT touch `lifecycleFunnel`, `lifecycleFilter`, or `exchangeProgress` in this task — that is Task 2.

- [ ] **Step 4: Run the test file to verify it passes**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — none of them exercise the zero-template counters yet).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # MUST print: main
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts
git commit -m "fix(dashboard): no-template dossiers roll up as 'none', not vacuously complete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Exclude empty dossiers from the « complete » counters

**Files:**
- Modify: `lib/dashboard/rollup.ts` (`lifecycleFunnel` at ~line 247, `lifecycleFilter` `'complete'` case at ~line 269, `exchangeProgress` at ~line 336)
- Test: `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes (from Task 1): `dossierComplete(r: Pick<DossierRollup, 'forms' | 'docs'>): boolean`; the `'none'` members of the `forms`/`docs` unions.
- Produces: no new exports — behavior change only: the funnel `complete` stage count, the `lifecycleFilter(rows, 'complete', …)` result, and `exchangeProgress(...).done` all use `dossierComplete`.

- [ ] **Step 1: Write the failing tests**

In `lib/dashboard/__tests__/rollup.test.ts`, add inside `describe('lifecycleFunnel')` (after the existing two `it`s):

```ts
  it('students with nothing assigned never count as complete', () => {
    const empty = rollupStudent({ id: 's9', full_name: 'Vide' }, [], {}, TODAY, t)
    const f = Object.fromEntries(lifecycleFunnel([], [empty], t).map(s => [s.key, s.count]))
    expect(f.complete).toBe(0)
    const complets = lifecycleFunnel([], [empty], t).find(s => s.key === 'complete')!
    expect(complets.display).toBe('0 / 1')
  })
  it('a forms-only dossier with all forms approved still counts as complete', () => {
    const TF: TemplateInfo[] = [{ id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' }]
    const r = rollupStudent(student, TF, { 's1:f1': { assignmentId: 'a1', status: 'approved' } }, TODAY, t)
    expect(lifecycleFunnel([], [r], t).find(s => s.key === 'complete')!.count).toBe(1)
  })
```

Add inside `describe('lifecycleFilter')` (after the existing `it`s):

```ts
  it('"complete" excludes students with nothing assigned', () => {
    const empty = rollupStudent({ id: 's9', full_name: 'Vide' }, [], {}, TODAY, t)
    const rowsEmpty = buildLifecycleRows([], [{ id: 's9', full_name: 'Vide', email: 'v@x.fr' }], [empty], t)
    expect(lifecycleFilter(rowsEmpty, 'complete', false)).toEqual([])
  })
```

Add inside `describe('exchangeProgress')` (after the existing `it`s):

```ts
  it('empty dossiers count in the total but never as done', () => {
    const empty = rollupStudent({ id: 's9', full_name: 'Vide' }, [], {}, TODAY, t)
    expect(exchangeProgress([], [empty], t)).toEqual({ done: 0, total: 1, label: '0 / 1 dossiers validés' })
  })
```

(`organizer.dashboard.progressDossiers` is plain interpolation — `"{done} / {total} dossiers validés"` — not an ICU plural, so the label keeps the plural spelling even at total 1.)

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `f.complete` is `1` (vacuous complete), filter returns the Vide row, `done` is `1`.

- [ ] **Step 3: Switch the three counters to `dossierComplete`**

In `lib/dashboard/rollup.ts`:

(a) `lifecycleFunnel` first line of the body:

```ts
  const complete = rollups.filter(r => dossierComplete(r)).length
```

(b) `lifecycleFilter`, the `'complete'` case:

```ts
    case 'complete': return visible.filter(r => r.kind === 'enrolled' && dossierComplete(r.rollup))
```

(c) `exchangeProgress`, the enrolled branch:

```ts
  if (rollups.length > 0) {
    const done = rollups.filter(r => dossierComplete(r)).length
    return { done, total: rollups.length, label: t('organizer.dashboard.progressDossiers', { done, total: rollups.length }) }
  }
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Full verification gate**

```bash
pnpm lint
pnpm test
npx tsc --noEmit
```

Expected: lint clean, full vitest suite green (watch `lib/students/__tests__/directory.test.ts` and `components/dashboard/` tests — they consume the rollup and must pass unchanged), tsc silent. `pnpm test:rls` is NOT needed (no migration/RLS/storage change).

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # MUST print: main
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts
git commit -m "fix(dashboard): exclude no-template dossiers from complete counters

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Out of scope (verified during design — no code needed)

- `components/dashboard/OverviewView.tsx` — renders pills via `formsPill`/`docsPill`/`rollup.overall`; inherits the fix.
- `components/dashboard/StudentDrawer.tsx` — renders the overall pill as-is → shows « — ».
- `lib/students/directory.ts` — `KIND_TO_KEY` already maps `neutral → 'incomplet'`; the accepted fallout is an unassigned student sorting as incomplete with summary « 0 pièce attendue ».
- `lifecycleActionCards` / `lifecycleFilter('missingdocs')` — check `docs === 'missing' || docs === 'pending'`; `'none'` correctly stays out.
- Pushing `main` (deploys prod) — Bjorn's call after the gate is green.
