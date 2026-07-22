# Acceptance Date on the Aperçu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the date a student accepted to join the exchange next to the green « Accepté(e) » pill in the Candidature column of the organizer Aperçu.

**Architecture:** The date already exists in the database as `applications.responded_at`. Task 1 adds a long-date formatter. Task 2 plumbs `responded_at` from the Supabase select through `listApplications` into the shared `AppRow` type and every construction site — pure data plumbing, no visible change. Task 3 adds a pure `acceptedOn` helper that encodes *which* rows deserve a date and hangs the result on every `LifecycleRow`. Task 4 renders it. No migration, no RLS change.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, next-intl, Tailwind, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-22-acceptance-date-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- Run targeted tests with `pnpm exec vitest run <path>`. Full gate is `pnpm lint && pnpm test && pnpm build`.
- No migration, no new column, no RLS policy change in this plan. `applications.responded_at` already exists.
- Never log or expose student/parent PII beyond what the organizer already sees on this page.
- The date renders **only** for application status `enrolling` or `enrolled`. Statuses `accepted`, `maybe`, `declined`, `rejected`, `submitted`, `invited`, `draft` render the pill alone, even when `responded_at` is non-null.
- French user-facing copy only where copy exists; this feature adds no new translation keys (a date is not copy).
- `frShortDate` is hard-coded `fr-FR`. That is pre-existing; do not "fix" it here.
- Commit after each task. Branch is `feature/acceptance-date`.

---

### Task 1: `fullDate` long-date formatter

The short format « 18 sept » drops the year. The Aperçu date gets a `title` tooltip carrying the full date so an organizer can disambiguate across program years.

**Files:**
- Modify: `lib/dates.ts`
- Test: `lib/__tests__/dates.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `fullDate(iso: string | null): string` exported from `@/lib/dates`. Returns « 18 septembre 2026 » style French long dates; empty string for null, empty, or unparseable input.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fullDate } from '@/lib/dates'

describe('fullDate', () => {
  it('formats a date-only ISO string in French with the year', () => {
    expect(fullDate('2026-09-18')).toBe('18 septembre 2026')
  })
  it('accepts a full timestamptz', () => {
    expect(fullDate('2026-09-18T12:00:00.000+00:00')).toBe('18 septembre 2026')
  })
  it('returns an empty string for null and empty input', () => {
    expect(fullDate(null)).toBe('')
    expect(fullDate('')).toBe('')
  })
  it('guards invalid dates', () => {
    expect(fullDate('not-a-date')).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/__tests__/dates.test.ts`
Expected: FAIL — `"fullDate" is not exported by "lib/dates.ts"` (or a TypeScript/import error naming `fullDate`).

- [ ] **Step 3: Write the implementation**

Append to `lib/dates.ts`, directly under `frShortDate`:

```ts
// "12 septembre 2026" style French long date; empty string for null/invalid
// input. Used for tooltips where the year matters and space does not.
export function fullDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/__tests__/dates.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/__tests__/dates.test.ts
git commit -m "feat(dates): add fullDate long-date formatter"
```

---

### Task 2: Plumb `responded_at` into `AppRow`

`responded_at` is not currently selected or carried anywhere. Add it as a **required** field on `AppRow` so `npx tsc --noEmit` flags every construction site that forgets it. There is no visible change after this task — it only makes the data available.

**Files:**
- Modify: `actions/applications-review.ts:25-32` (the `ApplicationListRow` type), `:68` and `:78` (both select lists)
- Modify: `lib/dashboard/rollup.ts:20` (the `AppRow` type)
- Modify: `app/(organizer)/dashboard/page.tsx:21-23`
- Modify: `app/(organizer)/applications/page.tsx:23-25`
- Modify: `actions/exchanges.ts:284-286`
- Test: `lib/dashboard/__tests__/rollup.test.ts:18` (the `app()` factory), `components/dashboard/__tests__/OverviewView.test.tsx:16-19` and `:65-69`, `components/applications/__tests__/CandidaturesView.test.tsx:16-20`

**Interfaces:**
- Consumes: nothing.
- Produces: `AppRow` gains `responded_at: string | null` — an ISO timestamp or null. Every `AppRow` reaching a component now carries it.

- [ ] **Step 1: Add the field to the two server types and both select lists**

In `actions/applications-review.ts`, extend the `ApplicationListRow` type:

```ts
export type ApplicationListRow = {
  id: string
  status: string
  submitted_at: string | null
  responded_at: string | null
  data: Record<string, string>
  email: string
  photoUrl?: string | null
}
```

In the same file, add `responded_at` to **both** select lists:

- line ~68 (`!opts?.withPhotos` branch):
  ```ts
      .select('id, status, submitted_at, responded_at, data, email')
  ```
- line ~78 (`withPhotos` branch):
  ```ts
    .select('id, status, submitted_at, responded_at, data, email, photo_path')
  ```

In `lib/dashboard/rollup.ts`, extend `AppRow` (line 20):

```ts
export type AppRow = { id: string; status: string; submitted_at: string | null; responded_at: string | null; data: Record<string, string>; email: string; photoUrl?: string | null }
```

- [ ] **Step 2: Run the type checker to see every construction site that now fails**

Run: `npx tsc --noEmit`
Expected: FAIL — errors of the form `Property 'responded_at' is missing in type ... but required in type 'AppRow'`, pointing at `app/(organizer)/dashboard/page.tsx`, `app/(organizer)/applications/page.tsx`, `actions/exchanges.ts`, and the three test files listed above.

- [ ] **Step 3: Fix the three production construction sites**

`app/(organizer)/dashboard/page.tsx` (line ~21):

```ts
  const apps: AppRow[] = applications.map((a: any) => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at,
    data: a.data ?? {}, email: a.email,
  }))
```

`app/(organizer)/applications/page.tsx` (line ~23):

```ts
  const apps: AppRow[] = applications.map(a => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at,
    data: a.data ?? {}, email: a.email, photoUrl: a.photoUrl ?? null,
  }))
```

`actions/exchanges.ts` (line ~284):

```ts
        const apps: AppRow[] = applications.map(a => ({
          id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at,
          data: a.data ?? {}, email: a.email,
        }))
```

- [ ] **Step 4: Fix the three test fixtures**

`lib/dashboard/__tests__/rollup.test.ts` (line ~18) — add the default to the factory so every existing test keeps compiling:

```ts
const app = (status: string, over: Partial<AppRow> = {}): AppRow =>
  ({ id: Math.random().toString(), status, submitted_at: '2026-09-12', responded_at: null, data: {}, email: 'x@y.fr', ...over })
```

`components/dashboard/__tests__/OverviewView.test.tsx` (line ~16) — the enrolled row gets a real date, which Task 4 will assert on:

```ts
const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', responded_at: '2026-09-18T12:00:00.000+00:00', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
]
```

Same file, the `closedApps` fixture (line ~65):

```ts
    const closedApps: AppRow[] = [
      ...apps,
      { id: '3', status: 'rejected', submitted_at: '2026-09-01', responded_at: null, data: { first_name: 'Nina', last_name: 'Rey' }, email: 'n@r.fr' },
      { id: '4', status: 'declined', submitted_at: '2026-09-02', responded_at: '2026-09-05T12:00:00.000+00:00', data: { first_name: 'Tom', last_name: 'Vidal' }, email: 't@v.fr' },
    ]
```

(The declined row deliberately carries a `responded_at` — Task 4 asserts no date renders for it.)

`components/applications/__tests__/CandidaturesView.test.tsx` (line ~16):

```ts
const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', responded_at: null, data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', responded_at: null, data: {}, email: 'r@r.fr' },
]
```

- [ ] **Step 5: Verify types and the touched tests are green**

Run: `npx tsc --noEmit`
Expected: PASS, no output.

Run: `pnpm exec vitest run lib/dashboard/__tests__/rollup.test.ts components/dashboard/__tests__/OverviewView.test.tsx components/applications/__tests__/CandidaturesView.test.tsx`
Expected: PASS, all existing tests, no behaviour change.

- [ ] **Step 6: Commit**

```bash
git add actions/applications-review.ts actions/exchanges.ts lib/dashboard/rollup.ts "app/(organizer)/dashboard/page.tsx" "app/(organizer)/applications/page.tsx" lib/dashboard/__tests__/rollup.test.ts components/dashboard/__tests__/OverviewView.test.tsx components/applications/__tests__/CandidaturesView.test.tsx
git commit -m "refactor(dashboard): carry applications.responded_at through AppRow"
```

---

### Task 3: `acceptedOn` helper and `LifecycleRow.acceptedOn`

This is where the product rule lives: a date appears only when the row means *joined*.

**Files:**
- Modify: `lib/dashboard/rollup.ts` (add helper after `applicantStatusPill`; extend `LifecycleRow`; extend `buildLifecycleRows`)
- Test: `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: `AppRow.responded_at` from Task 2.
- Produces:
  - `acceptedOn(status: string, respondedAt: string | null): string | null` exported from `@/lib/dashboard/rollup`.
  - Both `LifecycleRow` variants gain `acceptedOn: string | null`, populated by `buildLifecycleRows`.

- [ ] **Step 1: Write the failing tests**

In `lib/dashboard/__tests__/rollup.test.ts`, add `acceptedOn` to the import list from `@/lib/dashboard/rollup` (alongside `candidaturePill, applicantStatusPill, buildLifecycleRows`).

Then add this describe block immediately after the existing `describe('applicantStatusPill', ...)` block:

```ts
describe('acceptedOn', () => {
  const D = '2026-09-18T12:00:00.000+00:00'
  it.each([
    ['enrolled', D, D],
    ['enrolling', D, D],
    ['accepted', null, null],
    ['accepted', D, null],
    ['maybe', D, null],
    ['declined', D, null],
    ['rejected', D, null],
    ['submitted', D, null],
    ['invited', D, null],
    ['draft', D, null],
    ['enrolled', null, null],
    ['enrolling', null, null],
  ])('%s + %s → %s', (status, responded, expected) => {
    expect(acceptedOn(status as string, responded as string | null)).toBe(expected)
  })
})
```

And add these cases inside the existing `describe('buildLifecycleRows', ...)` block:

```ts
  it('an enrolled student inherits acceptedOn from the matching application', () => {
    const D = '2026-09-18T12:00:00.000+00:00'
    const apps = [app('enrolled', { id: 'a1', email: ' C@L.FR ', responded_at: D })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)
    expect(rows).toHaveLength(1)
    expect(rows[0].acceptedOn).toBe(D)
  })
  it('an enrolled student with no matching application has acceptedOn null', () => {
    const rows = buildLifecycleRows([], STUDENTS, ROLLUPS, t)
    expect(rows[0].acceptedOn).toBeNull()
  })
  it('an applicant row carries its own acceptedOn (null unless enrolling/enrolled)', () => {
    const D = '2026-09-18T12:00:00.000+00:00'
    const apps = [app('maybe', { id: 'a1', email: 'm@x.fr', responded_at: D })]
    const rows = buildLifecycleRows(apps, [], [], t)
    expect(rows[0].acceptedOn).toBeNull()
  })
  it('an orphan enrolled application keeps its acceptedOn on the fallback applicant row', () => {
    const D = '2026-09-18T12:00:00.000+00:00'
    const apps = [app('enrolled', { id: 'a1', email: 'orphan@x.fr', responded_at: D })]
    const rows = buildLifecycleRows(apps, [], [], t)
    expect(rows[0].kind).toBe('applicant')
    expect(rows[0].acceptedOn).toBe(D)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `acceptedOn is not a function` / no export named `acceptedOn`, and `rows[0].acceptedOn` is `undefined` rather than the expected value.

- [ ] **Step 3: Add the helper**

In `lib/dashboard/rollup.ts`, immediately after the `applicantStatusPill` function (around line 193), add:

```ts
// Statuses whose Candidature pill means "joined" — the only ones that carry an
// acceptance date. `accepted` is excluded on purpose: the organizer said yes but
// the student has not replied, so there is nothing to date. `maybe`/`declined`
// do set responded_at, but that is a response date, not an acceptance.
const ACCEPTED_ON_STATUSES = ['enrolling', 'enrolled']

// ISO timestamp of the moment the invitee accepted to join, or null when the
// row has no acceptance to date.
export function acceptedOn(status: string, respondedAt: string | null): string | null {
  if (!respondedAt) return null
  return ACCEPTED_ON_STATUSES.includes(status) ? respondedAt : null
}
```

- [ ] **Step 4: Extend `LifecycleRow` and `buildLifecycleRows`**

In `lib/dashboard/rollup.ts`, extend the `LifecycleRow` union (line ~155):

```ts
export type LifecycleRow =
  | { kind: 'applicant'; key: string; name: string; candidature: Pill; statut: Pill; closed: boolean; acceptedOn: string | null; app: AppRow }
  | { kind: 'enrolled'; key: string; name: string; candidature: Pill; acceptedOn: string | null; rollup: DossierRollup }
```

In `buildLifecycleRows`, add the field to the applicant mapping:

```ts
    .map(a => ({
      kind: 'applicant' as const,
      key: `app:${a.id}`,
      name: applicantName(a.data) || a.email,
      candidature: candidaturePill(a.status, t),
      statut: applicantStatusPill(a.status, t),
      closed: CLOSED_STATUSES.includes(a.status),
      acceptedOn: acceptedOn(a.status, a.responded_at),
      app: a,
    }))
```

Then replace the whole `enrolledRows` block with this version. The `apps.find(...)` lookup is hoisted out of the `if (!name)` branch so it runs for every enrolled row and serves **both** the name fallback and the acceptance date — one scan, not two:

```ts
  const enrolledRows: LifecycleRow[] = students.flatMap(s => {
    const rollup = rollupByStudent.get(s.id)
    if (!rollup) return []
    // Single lookup, shared by the name fallback and the acceptance date below.
    const match = apps.find(a => CONFIRMED_STATUSES.includes(a.status) && normEmail(a.email) === normEmail(s.email))
    // A student who replied yes but hasn't finished account setup has an empty
    // profile full_name. Borrow the applicant name from their confirmed
    // application, else show the email. The row's rollup copy carries the
    // resolved name so the drawer header shows it too.
    let name = rollup.name.trim()
    if (!name) name = (match ? applicantName(match.data) : '') || s.email
    const resolved = name === rollup.name ? rollup : { ...rollup, name }
    return [{
      kind: 'enrolled' as const,
      key: `stu:${s.id}`,
      name,
      candidature: candidaturePill(null, t),
      acceptedOn: match ? acceptedOn(match.status, match.responded_at) : null,
      rollup: resolved,
    }]
  })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS — the 12 new `acceptedOn` cases, the 4 new `buildLifecycleRows` cases, and every pre-existing case (the name-fallback tests must stay green; hoisting the lookup changes nothing about naming).

Run: `npx tsc --noEmit`
Expected: PASS, no output.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts
git commit -m "feat(dashboard): derive the acceptance date onto every lifecycle row"
```

---

### Task 4: Render the date beside the pill

**Files:**
- Modify: `components/dashboard/OverviewView.tsx:5-18` (imports), `:210-212` (the Candidature cell)
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: `LifecycleRow.acceptedOn` from Task 3, `fullDate` from Task 1, `frShortDate` (already imported in this file).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

In `components/dashboard/__tests__/OverviewView.test.tsx`, add these cases inside the existing `describe('OverviewView — unified lifecycle table', ...)` block. The fixtures they rely on were already set up in Task 2.

```ts
  it('shows the acceptance date beside the Accepté pill on the enrolled row', () => {
    renderWithIntl(<OverviewView {...base} />)
    const date = screen.getByTitle('18 septembre 2026')
    expect(date).toHaveTextContent('18 sept')
  })

  it('shows no date on rows that are not enrolled, even when responded_at is set', () => {
    // Léa is `submitted` with responded_at null; Tom is `declined` WITH a
    // responded_at — neither may render a date.
    const closedApps: AppRow[] = [
      ...apps,
      { id: '4', status: 'declined', submitted_at: '2026-09-02', responded_at: '2026-09-05T12:00:00.000+00:00', data: { first_name: 'Tom', last_name: 'Vidal' }, email: 't@v.fr' },
    ]
    renderWithIntl(<OverviewView {...base} apps={closedApps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les refusés et déclinés (1)' }))
    expect(screen.getByText('Tom Vidal')).toBeInTheDocument()
    expect(screen.queryByTitle('5 septembre 2026')).toBeNull()
    // exactly one date on the whole table — Camille's
    expect(screen.getAllByTitle(/septembre 2026/)).toHaveLength(1)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run components/dashboard/__tests__/OverviewView.test.tsx`
Expected: FAIL — `Unable to find an element with the title: 18 septembre 2026`.

- [ ] **Step 3: Add the import**

In `components/dashboard/OverviewView.tsx`, add below the existing `next-intl` import (line 5):

```ts
import { fullDate } from '@/lib/dates'
```

(`frShortDate` is already imported from `@/lib/dashboard/rollup` at line 17 — leave it as is.)

- [ ] **Step 4: Render the date**

In the same file, replace the Candidature cell (currently lines ~210-212):

```tsx
                <span>
                  <StatusPill pill={row.candidature} />
                </span>
```

with:

```tsx
                <span className="flex items-center gap-2">
                  <StatusPill pill={row.candidature} />
                  {row.acceptedOn && (
                    <span
                      className="text-[11.5px] text-muted-foreground"
                      title={fullDate(row.acceptedOn)}
                    >
                      {frShortDate(row.acceptedOn)}
                    </span>
                  )}
                </span>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run components/dashboard/__tests__/OverviewView.test.tsx`
Expected: PASS — both new cases plus every pre-existing case in the file.

- [ ] **Step 6: Run the full gate**

Run: `pnpm lint`
Expected: PASS, no errors.

Run: `pnpm test`
Expected: PASS, all suites. If failures appear under `.claude/worktrees/` or another checkout, re-run scoped: `pnpm exec vitest run --exclude '**/.claude/**'`.

Run: `pnpm build`
Expected: PASS. (If `.env.local` holds placeholders and the build fails on env validation rather than on types, `npx tsc --noEmit` is the accepted substitute for local verification.)

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): show the acceptance date next to the Accepté pill"
```

- [ ] **Step 8: Manual visual check**

Start the app (`pnpm dev`), open `/dashboard` as an organizer with at least one enrolled student, and confirm:
- the date sits to the right of the green « Accepté(e) » pill on one line;
- the Candidature column does not wrap or push the Formulaires column;
- hovering the date shows the full French date with the year;
- rows with « À examiner » / « Accepté(e) — en attente » / « A décliné » show no date.

If the column wraps at narrow widths, widen the second `GRID` track in `components/dashboard/OverviewView.tsx:35` from `1.15fr` to `1.35fr` and re-run `pnpm exec vitest run components/dashboard/__tests__/OverviewView.test.tsx`.

---

## Done when

- `acceptedOn` is unit-tested across all twelve status/timestamp combinations.
- The Aperçu shows « 18 sept » beside the green pill for enrolled students and nothing for everyone else.
- `pnpm lint`, `pnpm test`, `pnpm build` are green.
- Four commits on `feature/acceptance-date`, one per task.
