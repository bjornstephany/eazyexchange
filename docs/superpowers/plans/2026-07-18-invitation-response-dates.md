# Invitation Response Dates on Overview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each student's invitation-response date as a muted line under the Candidature pill on the organizer Overview page (`/dashboard`), whenever the student has replied.

**Architecture:** `applications.responded_at` already stores the yes/no/maybe click time. Surface it through the existing read (`listApplications`) → shared `AppRow` type → `buildLifecycleRows` (which attaches `respondedAt` to each row) → `OverviewView` renders a date line when present. No migration, no RLS change.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase, next-intl, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-18-invitation-response-dates-design.md`

## Global Constraints

- Package manager is **pnpm** (never npm).
- Verifying Changes gate: `pnpm lint`, `pnpm test`, `pnpm build` must pass. No migration/RLS/storage change here, so `test:rls` is NOT required.
- Never log or expose student PII beyond what the page already shows.
- The date-showing rule is exactly: **render the date iff `responded_at` is non-null.** No per-status branching.
- Date format uses `frShortDate(iso, { year: true })` → e.g. `12 juil. 2026`.
- French UI copy: no label prefix — the date alone under the pill.

---

### Task 1: `frShortDate` optional year

**Files:**
- Modify: `lib/dates.ts:4-10`
- Test: `lib/__tests__/dates.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `frShortDate(iso: string | null, opts?: { year?: boolean }): string` — backward-compatible; existing no-arg calls keep `"12 juil"` output, `{ year: true }` yields `"12 juil. 2026"`.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { frShortDate } from '@/lib/dates'

describe('frShortDate', () => {
  it('default: day + short month, no year, no trailing period', () => {
    expect(frShortDate('2026-07-12')).toBe('12 juil')
  })
  it('with { year: true }: appends the year', () => {
    expect(frShortDate('2026-07-12', { year: true })).toBe('12 juil. 2026')
  })
  it('accepts an ISO timestamp', () => {
    expect(frShortDate('2026-07-12T09:30:00Z', { year: true })).toBe('12 juil. 2026')
  })
  it('returns empty string for null / invalid', () => {
    expect(frShortDate(null)).toBe('')
    expect(frShortDate('not-a-date', { year: true })).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- lib/__tests__/dates.test.ts`
Expected: FAIL on the `{ year: true }` case (year not appended) — `frShortDate` currently ignores a second arg.

- [ ] **Step 3: Implement the year option**

Replace the body of `lib/dates.ts` (lines 4-10) with:

```ts
export function frShortDate(iso: string | null, opts?: { year?: boolean }): string {
  if (!iso) return ''
  const date = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return ''
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', ...(opts?.year ? { year: 'numeric' } : {}),
  }).format(date)
  return formatted.replace(/\.$/, '')
}
```

Note: with the year present the trailing character is a digit, so `replace(/\.$/, '')` leaves the mid-string period intact (`"12 juil. 2026"`); the no-year path still strips its trailing period (`"12 juil"`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- lib/__tests__/dates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/__tests__/dates.test.ts
git commit -m "feat(dates): optional year in frShortDate"
```

---

### Task 2: `listApplications` returns `responded_at`

**Files:**
- Modify: `actions/applications-review.ts:23-30` (type), `:65` and `:75` (selects), `:86-89` (withPhotos map)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ApplicationListRow` now includes `responded_at: string | null`; `listApplications` returns it in both the default and `withPhotos` branches.

- [ ] **Step 1: Add `responded_at` to the `ApplicationListRow` type**

In `actions/applications-review.ts`, change the type (lines 23-30) to include the field after `submitted_at`:

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

- [ ] **Step 2: Add `responded_at` to both `.select(...)` column lists**

Default branch (currently line 65):

```ts
      .select('id, status, submitted_at, responded_at, data, email')
```

`withPhotos` branch (currently line 75):

```ts
    .select('id, status, submitted_at, responded_at, data, email, photo_path')
```

- [ ] **Step 3: Carry `responded_at` through the `withPhotos` mapping**

In the `withPhotos` return map (currently lines 86-89), add the field:

```ts
  return rows.map(r => ({
    id: r.id, status: r.status, submitted_at: r.submitted_at, responded_at: r.responded_at,
    data: r.data, email: r.email,
    photoUrl: r.photo_path ? urlByPath.get(r.photo_path) ?? null : null,
  }))
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). `responded_at` is a real column on `applications` (written by `respondToInvitation`), so the generated Supabase types accept it in the select and the row cast.

- [ ] **Step 5: Commit**

```bash
git add actions/applications-review.ts
git commit -m "feat(applications): expose responded_at from listApplications"
```

---

### Task 3: `respondedAt` on lifecycle rows

**Files:**
- Modify: `lib/dashboard/rollup.ts:20` (`AppRow`), `:155-157` (`LifecycleRow`), `:200-233` (`buildLifecycleRows`)
- Modify: `app/(organizer)/dashboard/page.tsx:21-23`, `app/(organizer)/exchanges/page.tsx:28-30`, `app/(organizer)/applications/page.tsx:23-25`
- Test: `lib/dashboard/__tests__/rollup.test.ts:18-19` (helper) and new `describe` block

**Interfaces:**
- Consumes: `AppRow.responded_at` populated by `listApplications` (Task 2).
- Produces: `AppRow` gains required `responded_at: string | null`. Both `LifecycleRow` variants gain `respondedAt: string | null`. Applicant rows expose `app.responded_at`; enrolled rows expose the matched confirmed application's `responded_at` (or `null` when unmatched).

- [ ] **Step 1: Write the failing tests**

In `lib/dashboard/__tests__/rollup.test.ts`, first update the `app` helper default (line 18-19) so it satisfies the soon-to-be-required field:

```ts
const app = (status: string, over: Partial<AppRow> = {}): AppRow =>
  ({ id: Math.random().toString(), status, submitted_at: '2026-09-12', responded_at: null, data: {}, email: 'x@y.fr', ...over })
```

Then add a new describe block (place it right after the existing `describe('buildLifecycleRows', ...)` block, before `describe('closedCount', ...)`):

```ts
describe('buildLifecycleRows — response dates', () => {
  it('declined applicant row exposes app.responded_at', () => {
    const apps = [app('declined', { id: 'a1', responded_at: '2026-09-14T10:00:00Z' })]
    expect(buildLifecycleRows(apps, [], [], t)[0].respondedAt).toBe('2026-09-14T10:00:00Z')
  })
  it('maybe applicant row exposes app.responded_at', () => {
    const apps = [app('maybe', { id: 'a1', responded_at: '2026-09-15T10:00:00Z' })]
    expect(buildLifecycleRows(apps, [], [], t)[0].respondedAt).toBe('2026-09-15T10:00:00Z')
  })
  it('organizer-accepted but unreplied applicant has null respondedAt', () => {
    const apps = [app('accepted', { id: 'a1' })]
    expect(buildLifecycleRows(apps, [], [], t)[0].respondedAt).toBeNull()
  })
  it('enrolled row borrows responded_at from the matched confirmed application', () => {
    const apps = [app('enrolled', { id: 'a1', email: 'c@l.fr', responded_at: '2026-09-11T09:00:00Z', data: { first_name: 'Camille', last_name: 'Laurent' } })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)
    expect(rows[0].kind).toBe('enrolled')
    expect(rows[0].respondedAt).toBe('2026-09-11T09:00:00Z')
  })
  it('enrolled student with no matching application has null respondedAt', () => {
    expect(buildLifecycleRows([], STUDENTS, ROLLUPS, t)[0].respondedAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `respondedAt` does not exist on the rows yet (`undefined`, not the expected values), and/or TS complains about `responded_at` in `Partial<AppRow>`.

- [ ] **Step 3: Add `responded_at` to `AppRow`**

In `lib/dashboard/rollup.ts` line 20:

```ts
export type AppRow = { id: string; status: string; submitted_at: string | null; responded_at: string | null; data: Record<string, string>; email: string; photoUrl?: string | null }
```

- [ ] **Step 4: Add `respondedAt` to both `LifecycleRow` variants**

Replace the `LifecycleRow` union (lines 155-157) with:

```ts
export type LifecycleRow =
  | { kind: 'applicant'; key: string; name: string; candidature: Pill; statut: Pill; closed: boolean; respondedAt: string | null; app: AppRow }
  | { kind: 'enrolled'; key: string; name: string; candidature: Pill; respondedAt: string | null; rollup: DossierRollup }
```

- [ ] **Step 5: Populate `respondedAt` in `buildLifecycleRows`**

In `buildLifecycleRows`, add `respondedAt: a.responded_at,` to the applicant `.map(...)` object (after the `closed:` line):

```ts
    .map(a => ({
      kind: 'applicant' as const,
      key: `app:${a.id}`,
      name: applicantName(a.data) || a.email,
      candidature: candidaturePill(a.status, t),
      statut: applicantStatusPill(a.status, t),
      closed: CLOSED_STATUSES.includes(a.status),
      respondedAt: a.responded_at,
      app: a,
    }))
```

Then rewrite the enrolled `flatMap` so the confirmed-application match is computed unconditionally (it feeds both the name fallback and the response date):

```ts
  const enrolledRows: LifecycleRow[] = students.flatMap(s => {
    const rollup = rollupByStudent.get(s.id)
    if (!rollup) return []
    // The confirmed application this enrolled student came from (email match).
    // Supplies both the name fallback and the invitation-response date.
    const match = apps.find(a => CONFIRMED_STATUSES.includes(a.status) && normEmail(a.email) === normEmail(s.email))
    // A student who replied yes but hasn't finished account setup has an empty
    // profile full_name. Borrow the applicant name from the matched application,
    // else show the email. The row's rollup copy carries the resolved name so the
    // drawer header shows it too.
    let name = rollup.name.trim()
    if (!name) {
      name = (match ? applicantName(match.data) : '') || s.email
    }
    const resolved = name === rollup.name ? rollup : { ...rollup, name }
    return [{
      kind: 'enrolled' as const, key: `stu:${s.id}`, name,
      candidature: candidaturePill(null, t), rollup: resolved,
      respondedAt: match?.responded_at ?? null,
    }]
  })
```

- [ ] **Step 6: Populate `responded_at` at the three `AppRow` map sites**

`app/(organizer)/dashboard/page.tsx` (lines 21-23):

```ts
  const apps: AppRow[] = applications.map((a: any) => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at, data: a.data ?? {}, email: a.email,
  }))
```

`app/(organizer)/exchanges/page.tsx` (lines 28-30):

```ts
      const apps: AppRow[] = applications.map((a: any) => ({
        id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at, data: a.data ?? {}, email: a.email,
      }))
```

`app/(organizer)/applications/page.tsx` (lines 23-25):

```ts
  const apps: AppRow[] = applications.map(a => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, responded_at: a.responded_at, data: a.data ?? {}, email: a.email, photoUrl: a.photoUrl ?? null,
  }))
```

- [ ] **Step 7: Keep the OverviewView test fixture compiling**

`AppRow` is now required-`responded_at`, so the `OverviewView.test.tsx` fixtures must carry it. In `components/dashboard/__tests__/OverviewView.test.tsx`, update the `apps` array (lines 16-19) to add `responded_at: null` to each entry:

```ts
const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', responded_at: null, data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
]
```

(The real response-date rendering assertion is added in Task 4, which sets a non-null value.)

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm test -- lib/dashboard/__tests__/rollup.test.ts && npx tsc --noEmit`
Expected: rollup tests PASS (including the 5 new cases); `tsc` PASS (all AppRow literal sites updated).

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts \
  app/\(organizer\)/dashboard/page.tsx app/\(organizer\)/exchanges/page.tsx app/\(organizer\)/applications/page.tsx \
  components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): attach invitation respondedAt to lifecycle rows"
```

---

### Task 4: Render the date under the Candidature pill

**Files:**
- Modify: `components/dashboard/OverviewView.tsx:210-212` (the candidature cell) and the `frShortDate` import (line 17)
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: `row.respondedAt` (Task 3), `frShortDate(iso, { year: true })` (Task 1).
- Produces: the visible Overview UI (terminal deliverable; nothing downstream consumes it).

- [ ] **Step 1: Write the failing test**

In `components/dashboard/__tests__/OverviewView.test.tsx`, give the enrolled fixture a real response date so the row can show it. Change the Camille entry (id '2') in the `apps` array to:

```ts
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', responded_at: '2026-09-11T09:00:00Z', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
```

Then add a test inside `describe('OverviewView — unified lifecycle table', ...)`:

```ts
  it('shows the invitation response date under the candidature pill', () => {
    renderWithIntl(<OverviewView {...base} />)
    // Camille (enrolled) replied on 2026-09-11 → "11 sept. 2026" under her Accepté(e) pill.
    expect(screen.getByText('11 sept. 2026')).toBeInTheDocument()
  })

  it('omits the date when the student has not replied', () => {
    const noReply = { ...base, apps: base.apps.map(a => ({ ...a, responded_at: null })) }
    renderWithIntl(<OverviewView {...noReply} />)
    expect(screen.queryByText('11 sept. 2026')).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/dashboard/__tests__/OverviewView.test.tsx`
Expected: FAIL — `getByText('11 sept. 2026')` throws (no date rendered yet).

- [ ] **Step 3: Import `frShortDate` in OverviewView**

`frShortDate` is already imported from `@/lib/dashboard/rollup` in the existing import block (line 17). Confirm it is present; if so, no import change is needed. (It is re-exported by `rollup.ts`, so no new import line.)

- [ ] **Step 4: Render the date line in the candidature cell**

In `components/dashboard/OverviewView.tsx`, replace the candidature `<span>` (currently lines 210-212):

```tsx
                <span>
                  <StatusPill pill={row.candidature} />
                </span>
```

with a stacked cell that appends the muted date when present:

```tsx
                <span className="flex flex-col items-start gap-0.5">
                  <StatusPill pill={row.candidature} />
                  {row.respondedAt && (
                    <span className="text-[11px] text-muted-foreground">
                      {frShortDate(row.respondedAt, { year: true })}
                    </span>
                  )}
                </span>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- components/dashboard/__tests__/OverviewView.test.tsx`
Expected: PASS (both new tests plus the existing suite).

- [ ] **Step 6: Full Verifying Changes gate**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all PASS. (No migration/RLS/storage change → `test:rls` not required.)

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): show invitation response date under candidature pill"
```

---

## Self-Review

**Spec coverage:**
- Rule "date iff `responded_at` non-null" → Task 4 render guard + Task 3 derivation (accepted/declined/maybe carry it; submitted/organizer-accepted/rejected have null). ✓
- Data hop 1 (`listApplications` select) → Task 2. ✓
- Data hop 2 (`AppRow` + 3 map sites) → Task 3 steps 3, 6. ✓
- Data hop 3 (`respondedAt` on both `LifecycleRow` variants + enrolled email match) → Task 3 steps 4-5. ✓
- View (muted line under pill) → Task 4 step 4. ✓
- Date helper (`frShortDate` optional year) → Task 1. ✓
- Tests: `dates.test.ts` (Task 1), `rollup.test.ts` respondedAt flows (Task 3), `OverviewView.test.tsx` render + absence (Task 4). ✓
- No migration/RLS → stated in Global Constraints and Task 4 step 6. ✓
- Scope: Overview only; exchanges/applications carry the field but don't render (Task 3 step 6, no render change there). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**Type consistency:** `responded_at` (snake_case, DB/AppRow field) vs `respondedAt` (camelCase, LifecycleRow field) used consistently — applicant/enrolled rows both expose `respondedAt`; `frShortDate(iso, { year: true })` signature matches Task 1's definition. ✓
