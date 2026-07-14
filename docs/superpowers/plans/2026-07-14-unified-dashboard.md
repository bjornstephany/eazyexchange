# Unified Organizer Dashboard (phase removal) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-14-unified-dashboard-design.md` (approved)
**Branch:** `feature/unified-dashboard` (already created off `main`, spec cherry-picked)

**Goal:** Remove the Phase 1 / Phase 2 concept; the Aperçu becomes one lifecycle view (candidature → dossier complet), and the phase-flip checklist blast becomes a per-student checklist email at enrollment.

**Architecture:** `lib/dashboard/rollup.ts` stays the pure derivation library — new `LifecycleRow` model + unified funnel/filter/cards replace the `p1*`/`p2*` split. `OverviewView` renders one table. The phase column stays in the DB, unread (**no migration**). The checklist email moves into `respondToInvitation`'s « yes » path (admin client — file already allowlisted).

**Tech Stack:** Next.js 14 App Router, Supabase, Resend, Tailwind, vitest + @testing-library/react. Package manager is **pnpm**.

## Global Constraints

- **No DB migration** — `exchanges.phase` and `phase2_checklist_sent_at` stay in the schema, unread. `pnpm test:rls` is unaffected.
- **French copy uses typographic apostrophes** (`’`, never `'` between letters) in all UI/email strings — `lib/__tests__/email-french-copy.test.ts` enforces this for emails.
- **Never log student/parent PII** (emails, names) — the enrollment-email failure path logs a generic warning only.
- **Local gate per task:** `pnpm lint` + `pnpm test` (or the focused file, then full suite before commit). `pnpm build` fails locally (placeholder `.env.local`) — use `npx tsc --noEmit` instead.
- **Stage only named files** in every commit (`git add <paths>`, never `-A`).
- `actions/invitations.ts` is already in the admin-client allowlist (`lib/supabase/__tests__/admin-allowlist.test.ts`) — no allowlist change.

## Spec gaps discovered during exploration (resolved here)

1. **`actions/forms.ts` also reads `phase`** (not in the spec's sweep list): `activateTemplate` sends an immediate reminder to incomplete assignees *when the exchange is in phase 2*, and `getTemplatesPage` returns `phase` (which **no consumer uses**). Resolution, per the spec's own rule « Items created later are covered by the daily reminder engine »: **delete the immediate notify** in `activateTemplate` and drop `phase` from `getTemplatesPage` (Task 4).
2. **Empty-state gate** (« Commencez votre échange ») was `phase === 1 && !applicationOpen && deadline == null`. Without phases, a never-opened exchange with **directly-invited enrolled students** must still show the table. New gate: `!applicationOpen && applicationDeadline == null && rows.length === 0` (Task 2).
3. **`ExchangesView` progress without phase:** cards previously picked candidature-progress vs dossier-progress by phase. Unified rule (`exchangeProgress`): dossier progress once anyone is enrolled, else candidature progress (Task 3).

## File structure

| File | Change |
|---|---|
| `lib/dashboard/rollup.ts` | Add unified lifecycle API (Task 1); delete `p1*`/`p2*`/`actionCards`/`reminderLine`/`overviewSubline`/`progress` (Task 3) |
| `lib/dashboard/__tests__/rollup.test.ts` | Add lifecycle tests (Task 1); prune old describes (Task 3) |
| `components/dashboard/OverviewView.tsx` | Full rewrite: single lifecycle table (Task 2) |
| `components/dashboard/__tests__/OverviewView.test.tsx` | Full rewrite (Task 2) |
| `components/dashboard/StudentDrawer.tsx` | `p1StatusPill` → `applicantStatusPill` (Task 2) |
| `app/(organizer)/dashboard/page.tsx` | Drop `phase`, pass `students` (Task 2) |
| `app/(organizer)/exchanges/page.tsx` | `exchangeProgress` (Task 3); drop `phase` (Task 4) |
| `components/dashboard/PhaseStepper.tsx` | **Delete** (Task 4) |
| `actions/exchanges.ts` | Delete `setExchangePhase`, `sendPhase2ChecklistOnce`, `stampChecklist` (Task 4) |
| `actions/__tests__/exchange-phase.test.ts` | **Delete** (Task 4) |
| `components/shell/OrganizerShell.tsx` + `app/(organizer)/layout.tsx` | Drop phase pill + `ExchangeOption.phase` (Task 4) |
| `components/exchanges/ExchangesView.tsx` | Drop `PHASE_LABEL` + `ExchangeCardData.phase` (Task 4) |
| `components/settings/ProgramCard.tsx` + `actions/settings.ts` | Drop phase line + `ProgramInfo.phase` (Task 4) |
| `actions/forms.ts` | Drop phase-2 notify + `getTemplatesPage.phase` (Task 4) |
| shell/exchanges/settings/forms tests | Drop phase fixtures/assertions (Task 4) |
| `lib/email.ts` | Rename `sendPhase2ChecklistEmail` → `sendChecklistEmail` (Task 5) |
| `actions/invitations.ts` | Enrollment checklist email in the « yes » path (Task 5) |
| `actions/__tests__/enrollment-checklist.test.ts` | **New** (Task 5) |
| `lib/__tests__/email.forms.test.ts`, `lib/__tests__/email-french-copy.test.ts`, `actions/__tests__/applications.test.ts` | Rename/mock updates (Task 5) |

---

### Task 1: Unified lifecycle library (additive)

Add the new pure API to `lib/dashboard/rollup.ts` **without touching the existing `p1*`/`p2*` functions** (they still have consumers until Task 2/3 — the whole branch stays green at every task boundary).

**Files:**
- Modify: `lib/dashboard/rollup.ts`
- Test: `lib/dashboard/__tests__/rollup.test.ts` (append new describes)

**Interfaces (Produces — later tasks rely on these exact signatures):**
```ts
export type EnrolledStudent = { id: string; full_name: string; email: string }
export type LifecycleRow =
  | { kind: 'applicant'; key: string; name: string; candidature: Pill; statut: Pill; closed: boolean; app: AppRow }
  | { kind: 'enrolled'; key: string; name: string; candidature: Pill; rollup: DossierRollup }
export type FunnelStage = { key: string; label: string; count: number; display?: string }  // display added

export function candidaturePill(status: string | null): Pill
export function applicantStatusPill(status: string): Pill
export function buildLifecycleRows(apps: AppRow[], students: EnrolledStudent[], rollups: DossierRollup[]): LifecycleRow[]
export function closedCount(rows: LifecycleRow[]): number
export function lifecycleFunnel(apps: AppRow[], rollups: DossierRollup[]): FunnelStage[]
export function lifecycleFilter(rows: LifecycleRow[], key: string | null, showClosed: boolean): LifecycleRow[]
export function lifecycleSubline(apps: AppRow[], rollups: DossierRollup[]): string
export function lifecycleActionCards(apps: AppRow[], rollups: DossierRollup[], activeTemplateCount?: number): ActionCard[]
export function exchangeProgress(apps: AppRow[], rollups: DossierRollup[]): { done: number; total: number; label: string }
```

- [ ] **Step 1: Write the failing tests** — append to `lib/dashboard/__tests__/rollup.test.ts` (the file's existing `app`, `T`, `student`, `cell`, `TODAY` fixtures are module-level; reuse them). Extend the import at the top of the file:

```ts
import {
  frShortDate, p1Funnel, p1Filter, p1StatusPill, p1ResponsePill,
  rollupStudent, p2Funnel, p2Filter, formsPill, docsPill, actionCards,
  reminderLine, overviewSubline, progress, timelineFor, nextDeadline, p,
  candidaturePill, applicantStatusPill, buildLifecycleRows, closedCount,
  lifecycleFunnel, lifecycleFilter, lifecycleSubline, lifecycleActionCards, exchangeProgress,
  type AppRow, type TemplateInfo, type CellMap, type EnrolledStudent,
} from '@/lib/dashboard/rollup'
```

Then append at the end of the file:

```ts
// ---- Unified lifecycle view ----

const STUDENTS: EnrolledStudent[] = [{ id: 's1', full_name: 'Camille Laurent', email: 'c@l.fr' }]
const ROLLUPS = [rollupStudent(student, T, cell('approved', 'approved'), TODAY)]

describe('candidaturePill', () => {
  it.each([
    [null, 'ok', 'Confirmé(e)'],
    ['enrolled', 'ok', 'Confirmé(e)'], ['enrolling', 'ok', 'Confirmé(e)'],
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'Invité — en attente'],
    ['maybe', 'warn', 'Peut-être'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(candidaturePill(s as string | null)).toEqual({ kind, label }))
})

describe('applicantStatusPill', () => {
  it.each([
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'En attente'],
    ['enrolled', 'ok', 'Confirmé'], ['enrolling', 'ok', 'Confirmé'],
    ['maybe', 'warn', 'Hésite'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(applicantStatusPill(s)).toEqual({ kind, label }))
})

describe('buildLifecycleRows', () => {
  it('applicant rows first (apps order), then enrolled rows (students order)', () => {
    const apps = [app('submitted', { id: 'a1' }), app('maybe', { id: 'a2' })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS)
    expect(rows.map(r => r.kind)).toEqual(['applicant', 'applicant', 'enrolled'])
    expect(rows[2].name).toBe('Camille Laurent')
    expect(rows[2].candidature).toEqual({ kind: 'ok', label: 'Confirmé(e)' })
  })
  it('merges an enrolled application into the matching student row (dedupe by email)', () => {
    const apps = [app('enrolled', { id: 'a1', email: 'c@l.fr', data: { first_name: 'Camille', last_name: 'Laurent' } })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('enrolled')
  })
  it('dedupe is case- and whitespace-insensitive', () => {
    const apps = [app('enrolling', { id: 'a1', email: ' C@L.FR ' })]
    expect(buildLifecycleRows(apps, STUDENTS, ROLLUPS)).toHaveLength(1)
  })
  it('an enrolled application with no matching student falls back to a Confirmé applicant row (never dropped)', () => {
    const apps = [app('enrolled', { id: 'a1', email: 'orphan@x.fr', data: { first_name: 'Léo', last_name: 'Roy' } })]
    const rows = buildLifecycleRows(apps, [], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('applicant')
    expect(rows[0].candidature).toEqual({ kind: 'ok', label: 'Confirmé(e)' })
  })
  it('a non-confirmed application is NOT merged even if its email matches a student', () => {
    const apps = [app('declined', { id: 'a1', email: 'c@l.fr' })]
    expect(buildLifecycleRows(apps, STUDENTS, ROLLUPS)).toHaveLength(2)
  })
  it('flags rejected and declined rows as closed; names fall back to email', () => {
    const apps = [app('rejected', { id: 'a1', email: 'r@x.fr' }), app('declined', { id: 'a2' }), app('submitted', { id: 'a3' })]
    const rows = buildLifecycleRows(apps, [], [])
    expect(rows.map(r => r.kind === 'applicant' && r.closed)).toEqual([true, true, false])
    expect(rows[0].name).toBe('r@x.fr')
  })
})

describe('closedCount', () => {
  it('counts rejected + declined applicant rows', () => {
    const rows = buildLifecycleRows([app('rejected'), app('declined'), app('submitted')], STUDENTS, ROLLUPS)
    expect(closedCount(rows)).toBe(2)
  })
})

describe('lifecycleFunnel', () => {
  const APPS2 = [app('submitted'), app('submitted'), app('rejected'), app('declined'), app('accepted')]
  const R2 = [
    rollupStudent({ id: 's1', full_name: 'A' }, T, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'approved' } }, TODAY), // complete
    rollupStudent({ id: 's2', full_name: 'B' }, T, { 's2:f1': { assignmentId: 'a3', status: 'approved' }, 's2:d1': { assignmentId: 'a4', status: 'submitted' } }, TODAY), // review
    rollupStudent({ id: 's3', full_name: 'C' }, T, {}, new Date('2026-10-11T12:00:00')), // late, missing
  ]
  it('counts: Candidatures includes closed; Complets shows « x / y »', () => {
    const f = Object.fromEntries(lifecycleFunnel(APPS2, R2).map(s => [s.key, s.count]))
    expect(f).toEqual({ all: 5, toreview: 2, confirmed: 3, review: 1, late: 1, complete: 1 })
    const complets = lifecycleFunnel(APPS2, R2).find(s => s.key === 'complete')!
    expect(complets.display).toBe('1 / 3')
  })
  it('labels are the French design strings in order', () => {
    expect(lifecycleFunnel([], []).map(s => s.label))
      .toEqual(['Candidatures', 'À examiner', 'Confirmés', 'À vérifier', 'En retard', 'Complets'])
  })
})

describe('lifecycleFilter', () => {
  const late = rollupStudent({ id: 's2', full_name: 'Zoé Blanc' }, T, {}, new Date('2026-10-11T12:00:00'))
  const students2: EnrolledStudent[] = [...STUDENTS, { id: 's2', full_name: 'Zoé Blanc', email: 'z@b.fr' }]
  const rows = buildLifecycleRows(
    [app('submitted', { id: 'a1' }), app('maybe', { id: 'a2' }), app('rejected', { id: 'a3' })],
    students2, [...ROLLUPS, late],
  )
  it('default view hides closed rows; showClosed reveals them; null and "all" behave alike', () => {
    expect(lifecycleFilter(rows, null, false)).toHaveLength(4)
    expect(lifecycleFilter(rows, 'all', false)).toHaveLength(4)
    expect(lifecycleFilter(rows, null, true)).toHaveLength(5)
  })
  it('"toreview" → submitted applicants; "maybe" → hesitating applicants', () => {
    expect(lifecycleFilter(rows, 'toreview', false).map(r => r.kind === 'applicant' && r.app.status)).toEqual(['submitted'])
    expect(lifecycleFilter(rows, 'maybe', false).map(r => r.kind === 'applicant' && r.app.status)).toEqual(['maybe'])
  })
  it('"confirmed" → enrolled rows', () => {
    expect(lifecycleFilter(rows, 'confirmed', false).map(r => r.name)).toEqual(['Camille Laurent', 'Zoé Blanc'])
  })
  it('"late"/"missingdocs"/"complete" filter by rollup state', () => {
    expect(lifecycleFilter(rows, 'late', false).map(r => r.name)).toEqual(['Zoé Blanc'])
    expect(lifecycleFilter(rows, 'missingdocs', false).map(r => r.name)).toEqual(['Zoé Blanc'])
    expect(lifecycleFilter(rows, 'complete', false).map(r => r.name)).toEqual(['Camille Laurent'])
  })
})

describe('lifecycleSubline', () => {
  it('mixes both worlds with pluralization', () => {
    const R2 = [
      rollupStudent({ id: 's1', full_name: 'A' }, T, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'submitted' } }, TODAY),
      rollupStudent({ id: 's2', full_name: 'B' }, T, {}, new Date('2026-10-11T12:00:00')),
    ]
    expect(lifecycleSubline([app('submitted'), app('submitted')], R2))
      .toBe('2 candidatures à examiner, 1 dossier à vérifier, 1 élève en retard.')
  })
})

describe('lifecycleActionCards', () => {
  it('orders by urgency: toreview, review, late, missingdocs, maybe — omitting zero counts', () => {
    const R2 = [
      rollupStudent({ id: 's1', full_name: 'A' }, T, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'submitted' } }, TODAY), // review
      rollupStudent({ id: 's2', full_name: 'B' }, T, {}, new Date('2026-10-11T12:00:00')), // late + missing docs
    ]
    const cards = lifecycleActionCards([app('submitted'), app('maybe')], R2)
    expect(cards.map(c => c.filterKey)).toEqual(['toreview', 'review', 'late', 'missingdocs', 'maybe'])
    expect(cards[0].title).toBe('1 candidature à examiner')
  })
  it('prepends the no-active-forms card when activeTemplateCount is 0', () => {
    const cards = lifecycleActionCards([], [], 0)
    expect(cards.map(c => c.filterKey)).toEqual(['noforms'])
    expect(cards[0].href).toBe('/forms')
  })
  it('returns nothing when all is quiet', () => {
    expect(lifecycleActionCards([app('enrolled')], ROLLUPS, 3)).toEqual([])
  })
})

describe('exchangeProgress', () => {
  it('dossier progress once students are enrolled', () => {
    const R2 = [ROLLUPS[0], rollupStudent({ id: 's2', full_name: 'B' }, T, {}, TODAY)]
    expect(exchangeProgress([app('submitted')], R2)).toEqual({ done: 1, total: 2, label: '1 / 2 dossiers validés' })
  })
  it('candidature progress before any enrollment', () => {
    expect(exchangeProgress([app('submitted'), app('accepted')], []))
      .toEqual({ done: 1, total: 2, label: '1 / 2 candidatures traitées' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — `candidaturePill` etc. are not exported.

- [ ] **Step 3: Implement** — in `lib/dashboard/rollup.ts`:

(a) Add to the imports at the top (after the `frShortDate` import):
```ts
import { applicantName } from '@/lib/application-form'
```
(b) Change the `FunnelStage` type to:
```ts
export type FunnelStage = { key: string; label: string; count: number; display?: string }
```
(c) Append at the end of the file:

```ts
// ---- Unified lifecycle view (single dashboard, no phases) ----

export type EnrolledStudent = { id: string; full_name: string; email: string }

export type LifecycleRow =
  | { kind: 'applicant'; key: string; name: string; candidature: Pill; statut: Pill; closed: boolean; app: AppRow }
  | { kind: 'enrolled'; key: string; name: string; candidature: Pill; rollup: DossierRollup }

const CLOSED_STATUSES = ['rejected', 'declined']

// Candidature column: where the person stands in the recruitment funnel.
// `null` = enrolled student with no application row (directly invited).
export function candidaturePill(status: string | null): Pill {
  switch (status) {
    case null:
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: 'Confirmé(e)' }
    case 'submitted': return { kind: 'neutral', label: 'À examiner' }
    case 'accepted': return { kind: 'warn', label: 'Invité — en attente' }
    case 'maybe': return { kind: 'warn', label: 'Peut-être' }
    case 'declined': return { kind: 'bad', label: 'A décliné' }
    case 'rejected': return { kind: 'bad', label: 'Refusé' }
    default: return { kind: 'neutral', label: '—' }
  }
}

// Statut column for applicant rows (enrolled rows show rollup.overall instead).
export function applicantStatusPill(status: string): Pill {
  switch (status) {
    case 'submitted': return { kind: 'neutral', label: 'À examiner' }
    case 'accepted': return { kind: 'warn', label: 'En attente' }
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: 'Confirmé' }
    case 'maybe': return { kind: 'warn', label: 'Hésite' }
    case 'declined': return { kind: 'bad', label: 'A décliné' }
    case 'rejected': return { kind: 'bad', label: 'Refusé' }
    default: return { kind: 'neutral', label: '—' }
  }
}

function normEmail(e: string): string {
  return e.trim().toLowerCase()
}

// One row per person, applicants first then enrolled students. An application
// that reached enrolling/enrolled and matches an enrolled student's email is
// merged into that student's row; a confirmed application with no matching
// student (shouldn't happen — enrollment reuses the application email) falls
// back to an applicant row with a Confirmé pill, never silently dropped.
export function buildLifecycleRows(apps: AppRow[], students: EnrolledStudent[], rollups: DossierRollup[]): LifecycleRow[] {
  const rollupByStudent = new Map(rollups.map(r => [r.studentId, r]))
  const enrolledEmails = new Set(students.map(s => normEmail(s.email)))

  const applicantRows: LifecycleRow[] = apps
    .filter(a => !(CONFIRMED_STATUSES.includes(a.status) && enrolledEmails.has(normEmail(a.email))))
    .map(a => ({
      kind: 'applicant' as const,
      key: `app:${a.id}`,
      name: applicantName(a.data) || a.email,
      candidature: candidaturePill(a.status),
      statut: applicantStatusPill(a.status),
      closed: CLOSED_STATUSES.includes(a.status),
      app: a,
    }))

  const enrolledRows: LifecycleRow[] = students.flatMap(s => {
    const rollup = rollupByStudent.get(s.id)
    if (!rollup) return []
    return [{ kind: 'enrolled' as const, key: `stu:${s.id}`, name: rollup.name, candidature: candidaturePill(null), rollup }]
  })

  return [...applicantRows, ...enrolledRows]
}

export function closedCount(rows: LifecycleRow[]): number {
  return rows.filter(r => r.kind === 'applicant' && r.closed).length
}

// Candidatures counts ALL received applications, including rejected/declined
// (historical volume) — the hide-closed toggle only affects the table.
export function lifecycleFunnel(apps: AppRow[], rollups: DossierRollup[]): FunnelStage[] {
  const complete = rollups.filter(r => r.forms === 'complete' && r.docs === 'complete').length
  return [
    { key: 'all', label: 'Candidatures', count: apps.length },
    { key: 'toreview', label: 'À examiner', count: apps.filter(a => a.status === 'submitted').length },
    { key: 'confirmed', label: 'Confirmés', count: rollups.length },
    { key: 'review', label: 'À vérifier', count: rollups.filter(r => r.overall.kind === 'info').length },
    { key: 'late', label: 'En retard', count: rollups.filter(r => r.late).length },
    { key: 'complete', label: 'Complets', count: complete, display: `${complete} / ${rollups.length}` },
  ]
}

export function lifecycleFilter(rows: LifecycleRow[], key: string | null, showClosed: boolean): LifecycleRow[] {
  const visible = showClosed ? rows : rows.filter(r => r.kind === 'enrolled' || !r.closed)
  if (key === null || key === 'all') return visible
  switch (key) {
    case 'toreview': return visible.filter(r => r.kind === 'applicant' && r.app.status === 'submitted')
    case 'maybe': return visible.filter(r => r.kind === 'applicant' && r.app.status === 'maybe')
    case 'confirmed': return visible.filter(r => r.kind === 'enrolled' || CONFIRMED_STATUSES.includes(r.app.status))
    case 'review': return visible.filter(r => r.kind === 'enrolled' && r.rollup.overall.kind === 'info')
    case 'late': return visible.filter(r => r.kind === 'enrolled' && r.rollup.late)
    case 'missingdocs': return visible.filter(r => r.kind === 'enrolled' && (r.rollup.docs === 'missing' || r.rollup.docs === 'pending'))
    case 'complete': return visible.filter(r => r.kind === 'enrolled' && r.rollup.forms === 'complete' && r.rollup.docs === 'complete')
    default: return visible
  }
}

export function lifecycleSubline(apps: AppRow[], rollups: DossierRollup[]): string {
  const a = apps.filter(x => x.status === 'submitted').length
  const r = rollups.filter(x => x.overall.kind === 'info').length
  const l = rollups.filter(x => x.late).length
  return `${a} candidature${p(a)} à examiner, ${r} dossier${p(r)} à vérifier, ${l} élève${p(l)} en retard.`
}

// « À faire maintenant » cards mixing both worlds, ordered by urgency.
export function lifecycleActionCards(apps: AppRow[], rollups: DossierRollup[], activeTemplateCount?: number): ActionCard[] {
  const cards: ActionCard[] = []
  if (activeTemplateCount === 0) {
    cards.push({
      title: 'Aucun formulaire actif',
      desc: 'Préparez les documents et formulaires à demander aux familles.',
      cta: 'Préparer les formulaires', tone: 'accent', filterKey: 'noforms', href: '/forms',
    })
  }
  const a = apps.filter(x => x.status === 'submitted').length
  if (a > 0) {
    cards.push({
      title: `${a} candidature${p(a)} à examiner`,
      desc: 'Nouveaux dossiers en attente de votre décision. L’invitation part automatiquement dès l’acceptation.',
      cta: 'Examiner', tone: 'accent', filterKey: 'toreview',
    })
  }
  const r = rollups.filter(x => x.overall.kind === 'info').length
  if (r > 0) {
    cards.push({
      title: `${r} dossier${p(r)} à vérifier`,
      desc: 'Formulaires et documents reçus, en attente de validation.',
      cta: 'Vérifier', tone: 'accent', filterKey: 'review',
    })
  }
  const l = rollups.filter(x => x.late).length
  if (l > 0) {
    cards.push({
      title: `${l} élève${p(l)} en retard`,
      desc: 'Échéance dépassée — relance renforcée en cours.',
      cta: 'Relancer', tone: 'bad', filterKey: 'late',
    })
  }
  const m = rollups.filter(x => x.docs === 'missing' || x.docs === 'pending').length
  if (m > 0) {
    cards.push({
      title: `${m} élève${p(m)} : documents manquants`,
      desc: 'Pièces non reçues avant l’échéance.',
      cta: 'Voir les élèves', tone: 'warn', filterKey: 'missingdocs',
    })
  }
  const c = apps.filter(x => x.status === 'maybe').length
  if (c > 0) {
    cards.push({
      title: `${c} élève${p(c)} hésite${c > 1 ? 'nt' : ''} — à relancer`,
      desc: 'Réponses « Peut-être » à convertir en confirmation.',
      cta: 'Relancer', tone: 'warn', filterKey: 'maybe',
    })
  }
  return cards
}

// Exchange-card progress (Échanges page): dossier progress once anyone is
// enrolled, candidature progress before that.
export function exchangeProgress(apps: AppRow[], rollups: DossierRollup[]): { done: number; total: number; label: string } {
  if (rollups.length > 0) {
    const done = rollups.filter(r => r.forms === 'complete' && r.docs === 'complete').length
    return { done, total: rollups.length, label: `${done} / ${rollups.length} dossiers validés` }
  }
  const total = apps.length
  const done = apps.filter(a => a.status !== 'submitted').length
  return { done, total, label: `${done} / ${total} candidatures traitées` }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts`
Expected: PASS (old + new describes). Then `pnpm test` — full suite green (additions are purely additive).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts
git commit -m "feat(dashboard): unified lifecycle derivation library (rows, funnel, filter, cards)"
```

---

### Task 2: OverviewView rewrite — single lifecycle table

**Files:**
- Rewrite: `components/dashboard/OverviewView.tsx`
- Modify: `components/dashboard/StudentDrawer.tsx` (2 lines: `p1StatusPill` → `applicantStatusPill`)
- Modify: `app/(organizer)/dashboard/page.tsx`
- Rewrite test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `OverviewProps` without `phase`, with `students: EnrolledStudent[]` — `app/(organizer)/dashboard/page.tsx` is the only caller and is updated in this task.

**UX decisions locked here (from spec + mockup v2):** funnel kicker « Progression de l'échange »; table columns `Élève · Candidature · Formulaires · Documents · Statut`; no Échéance column; right rail = action cards only (no PhaseStepper, no reminder note); closed rows behind « Afficher les refusés et déclinés (n) » under the table.

- [ ] **Step 1: Write the failing tests** — replace `components/dashboard/__tests__/OverviewView.test.tsx` entirely with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/actions/applications-review', () => ({ acceptApplication: vi.fn(), rejectApplication: vi.fn() }))
vi.mock('@/components/dashboard/InviteModal', () => ({
  InviteModal: ({ open }: { open: boolean }) => (open ? <div>invite-modal</div> : null),
}))

import { OverviewView } from '@/components/dashboard/OverviewView'
import type { AppRow, DossierRollup, EnrolledStudent } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
]
const students: EnrolledStudent[] = [{ id: 's1', full_name: 'Camille Laurent', email: 'c@l.fr' }]
const rollups: DossierRollup[] = [{
  studentId: 's1', name: 'Camille Laurent', forms: 'pending', docs: 'missing',
  due: '2026-10-03', late: true, overall: { kind: 'bad', label: 'En retard' },
}]
const base = {
  exchangeId: 'ex1', apps, students, rollups, templates: [], cellMap: {},
  applicationOpen: true, applicationDeadline: '2026-09-01' as string | null, applySlug: 'france-canada',
}

describe('OverviewView — unified lifecycle table', () => {
  it('renders heading, unified funnel and one row per person (dedupe by email)', () => {
    render(<OverviewView {...base} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.getByText('Candidatures')).toBeInTheDocument()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    // enrolled app c@l.fr merged into the student row: exactly one Camille row
    expect(screen.getAllByText('Camille Laurent')).toHaveLength(1)
    expect(screen.getByText('Confirmé(e)')).toBeInTheDocument()
    // enrolled row shows rollup pills, applicant row shows dashes
    expect(screen.getByText('En cours')).toBeInTheDocument()   // formsPill(pending)
    expect(screen.getByText('Manquant')).toBeInTheDocument()   // docsPill(missing)
  })

  it('Complets tile reads « x / y »', () => {
    render(<OverviewView {...base} />)
    expect(screen.getByRole('button', { name: /0 \/ 1\s*Complets/ })).toBeInTheDocument()
  })

  it('funnel tile filters the table and shows a dismissible chip', () => {
    render(<OverviewView {...base} />)
    fireEvent.click(screen.getByRole('button', { name: /À examiner/ }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Filtre :/ }))
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })

  it('action card click applies its filter', () => {
    render(<OverviewView {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Examiner' }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
  })

  it('hides rejected/declined rows behind the « Afficher » toggle', () => {
    const closedApps: AppRow[] = [
      ...apps,
      { id: '3', status: 'rejected', submitted_at: '2026-09-01', data: { first_name: 'Nina', last_name: 'Rey' }, email: 'n@r.fr' },
      { id: '4', status: 'declined', submitted_at: '2026-09-02', data: { first_name: 'Tom', last_name: 'Vidal' }, email: 't@v.fr' },
    ]
    render(<OverviewView {...base} apps={closedApps} />)
    expect(screen.queryByText('Nina Rey')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Afficher les refusés et déclinés (2)' })
    fireEvent.click(toggle)
    expect(screen.getByText('Nina Rey')).toBeInTheDocument()
    expect(screen.getByText('Tom Vidal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Masquer les refusés et déclinés' }))
    expect(screen.queryByText('Nina Rey')).toBeNull()
  })

  it('row click opens the right drawer per row kind', () => {
    render(<OverviewView {...base} />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(screen.getByText('Parcours')).toBeInTheDocument() // application timeline
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    fireEvent.click(screen.getByText('Camille Laurent'))
    expect(screen.getByText(/Formulaires & documents/)).toBeInTheDocument() // student checklist
  })

  it('right rail has action cards but no reminder note and no phase stepper', () => {
    render(<OverviewView {...base} />)
    expect(screen.getByText('À faire maintenant')).toBeInTheDocument()
    expect(screen.queryByText(/Relance automatique demain 8h/)).toBeNull()
    expect(screen.queryByText(/Phase/)).toBeNull()
  })

  it('shows the no-active-forms card linking to /forms when there are no active templates', () => {
    render(<OverviewView {...base} />)
    expect(screen.getByText('Aucun formulaire actif')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer les formulaires' })).toHaveAttribute('href', '/forms')
  })

  it('shows the empty-state CTA only when applications never opened AND nobody exists', () => {
    render(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('heading', { name: /Commencez votre échange/ })).toBeInTheDocument()
    expect(screen.queryByText("Vue d'ensemble")).toBeNull()
  })

  it('directly-invited students suppress the empty state even if applications never opened', () => {
    render(<OverviewView {...base} apps={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })

  it('CTA opens the invite modal', () => {
    render(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })

  it('keeps the invite modal mounted when opening applications flips neverOpened', () => {
    const { rerender } = render(
      <OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
    rerender(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen applicationDeadline="2026-09-01" />)
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run components/dashboard/__tests__/OverviewView.test.tsx`
Expected: FAIL (`phase` prop missing / new props unknown / new copy absent).

- [ ] **Step 3: Rewrite `components/dashboard/OverviewView.tsx`** — full replacement:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { AppRow, DossierRollup, TemplateInfo, CellMap, ActionCard, Pill, EnrolledStudent, LifecycleRow } from '@/lib/dashboard/rollup'
import {
  buildLifecycleRows,
  lifecycleFunnel,
  lifecycleFilter,
  lifecycleSubline,
  lifecycleActionCards,
  closedCount,
  formsPill,
  docsPill,
  nextDeadline,
  frShortDate,
} from '@/lib/dashboard/rollup'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { StudentDrawer, type DrawerSubject } from '@/components/dashboard/StudentDrawer'
import { InviteModal } from '@/components/dashboard/InviteModal'

export type OverviewProps = {
  exchangeId: string
  apps: AppRow[]
  students: EnrolledStudent[]
  rollups: DossierRollup[]
  templates: TemplateInfo[]
  cellMap: CellMap
  applicationOpen: boolean
  applicationDeadline: string | null
  applySlug: string
}

// Labels for filter keys that only exist on action cards, not as funnel tiles.
const ACTION_ONLY_FILTER_LABELS: Record<string, string> = {
  maybe: 'Hésitent',
  missingdocs: 'Docs manquants',
}

const GRID = 'grid-cols-[1.7fr_1.15fr_1fr_1fr_1fr_22px]'

const ACTION_BORDER: Record<ActionCard['tone'], string> = {
  accent: 'border-l-brand',
  warn: 'border-l-[#B7791F]',
  bad: 'border-l-[#C0392B]',
}
const ACTION_CTA: Record<ActionCard['tone'], string> = {
  accent: 'bg-brand text-white',
  warn: 'bg-warn text-warn-text',
  bad: 'bg-danger text-danger-text',
}

function checklistItemPill(group: 'form' | 'doc', status: string | undefined): Pill {
  if (status === 'approved') return { kind: 'ok', label: group === 'form' ? 'Reçu' : 'Fourni' }
  if (status === 'submitted') return { kind: 'info', label: 'À vérifier' }
  if (status === 'draft' || status === 'rejected') return { kind: 'warn', label: 'En cours' }
  return { kind: 'bad', label: 'Manquant' }
}

export function OverviewView(props: OverviewProps) {
  const { exchangeId, apps, students, rollups, templates, cellMap, applicationOpen, applicationDeadline, applySlug } = props
  const [filter, setFilter] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const [selected, setSelected] = useState<DrawerSubject | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  function studentSubject(rollup: DossierRollup): DrawerSubject {
    const items = templates.map((t) => {
      const group: 'form' | 'doc' = t.type === 'data_entry' ? 'form' : 'doc'
      const status = cellMap[`${rollup.studentId}:${t.id}`]?.status
      return { label: t.name, group, pill: checklistItemPill(group, status) }
    })
    return { kind: 'student', rollup, items }
  }

  function rowSubject(row: LifecycleRow): DrawerSubject {
    return row.kind === 'applicant' ? { kind: 'application', app: row.app } : studentSubject(row.rollup)
  }

  const rows = buildLifecycleRows(apps, students, rollups)

  // Opening applications revalidates /dashboard, which flips these props and so
  // flips `neverOpened`. The InviteModal is therefore rendered once, outside this
  // branch (see the return), so that mid-flow flip can't unmount the one-time link.
  // Directly-invited students (rows > 0) must see the table even if applications
  // never opened — hence the rows.length guard.
  const neverOpened = !applicationOpen && applicationDeadline == null && rows.length === 0

  const funnel = lifecycleFunnel(apps, rollups)
  const activeStage = filter ? funnel.find((s) => s.key === filter) : undefined
  const filterLabel =
    filter && filter !== 'all' ? activeStage?.label ?? ACTION_ONLY_FILTER_LABELS[filter] ?? filter : null

  const filteredRows = lifecycleFilter(rows, filter, showClosed)
  const nClosed = closedCount(rows)

  const cards = lifecycleActionCards(apps, rollups, templates.length)
  const next = nextDeadline(rollups)
  const subline = lifecycleSubline(apps, rollups)

  function handleStageClick(key: string) {
    if (key === 'all') {
      setFilter(null)
      return
    }
    setFilter((cur) => (cur === key ? null : key))
  }

  return (
    <>
      {neverOpened ? (
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
        </div>
      ) : (
        <div>
      <div className="mb-[22px]">
        <h1 className="font-display text-[26px] font-bold tracking-tight">Vue d&apos;ensemble</h1>
        <p className="text-sm text-muted-foreground">{subline}</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Funnel card */}
          <div className="bg-card border rounded-[14px] p-[18px] px-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
                Progression de l&apos;échange
              </span>
              {filterLabel && (
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="border bg-hint rounded-pill px-[11px] py-1 text-[11px] font-medium text-muted-foreground"
                >
                  Filtre : {filterLabel} ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5 mt-3">
              {funnel.map((stage) => {
                const isActive = filter === stage.key
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => handleStageClick(stage.key)}
                    className={`flex flex-col items-start gap-1 rounded-[10px] border px-3.5 py-2.5 min-w-[96px] ${
                      isActive ? 'border-brand bg-tint/40' : ''
                    }`}
                  >
                    <span className={`font-display text-[22px] font-bold leading-none ${isActive ? 'text-brand' : 'text-navy'}`}>
                      {stage.display ?? stage.count}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">{stage.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Lifecycle table card */}
          <div className="bg-card border rounded-[14px] overflow-hidden">
            <div className={`grid ${GRID} font-mono text-[10px] uppercase tracking-[.08em] text-tertiary bg-[#FBFCFE] border-b px-5 py-2.5`}>
              <span>Élève</span>
              <span>Candidature</span>
              <span>Formulaires</span>
              <span>Documents</span>
              <span>Statut</span>
              <span>&rsaquo;</span>
            </div>

            {filteredRows.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Aucun élève ne correspond à ce filtre.</p>
            )}
            {filteredRows.map((row) => (
              <div
                key={row.key}
                onClick={() => setSelected(rowSubject(row))}
                className={`grid ${GRID} px-5 py-3 text-sm border-b last:border-0 hover:bg-hoverrow-soft cursor-pointer`}
              >
                <span className="font-medium text-navy">{row.name}</span>
                <span>
                  <StatusPill pill={row.candidature} />
                </span>
                <span>
                  {row.kind === 'enrolled' ? <StatusPill pill={formsPill(row.rollup.forms)} /> : <span className="text-placeholder">—</span>}
                </span>
                <span>
                  {row.kind === 'enrolled' ? <StatusPill pill={docsPill(row.rollup.docs)} /> : <span className="text-placeholder">—</span>}
                </span>
                <span>
                  <StatusPill pill={row.kind === 'enrolled' ? row.rollup.overall : row.statut} />
                </span>
                <span className="text-placeholder">&rsaquo;</span>
              </div>
            ))}

            {nClosed > 0 && (
              <div className="border-t px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowClosed((v) => !v)}
                  className="text-[12.5px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  {showClosed ? 'Masquer les refusés et déclinés' : `Afficher les refusés et déclinés (${nClosed})`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right rail — only the « À faire maintenant » action cards */}
        <div className="w-full xl:w-[344px] flex-none flex flex-col gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary">
            À faire maintenant
          </span>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tout est à jour ✓{next ? ` — prochaine échéance le ${frShortDate(next)}.` : ''}
            </p>
          ) : (
            cards.map((card) => (
              <div
                key={card.filterKey}
                className={`bg-card border rounded-[12px] p-[17px] pl-[19px] flex flex-col gap-1.5 border-l-[3px] ${ACTION_BORDER[card.tone]}`}
              >
                <span className="text-sm font-semibold text-navy">{card.title}</span>
                <span className="text-[12.5px] text-muted-foreground">{card.desc}</span>
                {card.href ? (
                  <Link
                    href={card.href}
                    className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                  >
                    {card.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFilter(card.filterKey)}
                    className={`self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold ${ACTION_CTA[card.tone]}`}
                  >
                    {card.cta}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <StudentDrawer subject={selected} onClose={() => setSelected(null)} />
        </div>
      )}
      <InviteModal exchangeId={exchangeId} applySlug={applySlug} open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}
```

- [ ] **Step 4: Update `components/dashboard/StudentDrawer.tsx`** — two edits:

```ts
// line 4, replace:
import { timelineFor, frShortDate, p1StatusPill } from '@/lib/dashboard/rollup'
// with:
import { timelineFor, frShortDate, applicantStatusPill } from '@/lib/dashboard/rollup'
```
```ts
// line 68, replace:
  const statusPill = drawerSubject.kind === 'application' ? p1StatusPill(drawerSubject.app.status) : drawerSubject.rollup.overall
// with:
  const statusPill = drawerSubject.kind === 'application' ? applicantStatusPill(drawerSubject.app.status) : drawerSubject.rollup.overall
```

- [ ] **Step 5: Update `app/(organizer)/dashboard/page.tsx`** — full replacement:

```tsx
import { cookies } from 'next/headers'
import { getExchanges, getExchangeGrid } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications-review'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { rollupStudent, type AppRow, type EnrolledStudent } from '@/lib/dashboard/rollup'
import { OverviewView } from '@/components/dashboard/OverviewView'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

export default async function DashboardPage() {
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  const [applications, grid] = await Promise.all([
    listApplications(active.id),
    getExchangeGrid(active.id),
  ])
  const apps: AppRow[] = applications.map((a: any) => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email,
  }))
  const templates = grid.templates.map((t: any) => ({ id: t.id, type: t.type, name: t.name, deadline: t.deadline }))
  const students: EnrolledStudent[] = grid.students.map((s: any) => ({ id: s.id, full_name: s.full_name, email: s.email }))
  const rollups = grid.students.map((s: any) => rollupStudent(s, templates, grid.cellMap))

  return (
    <OverviewView
      exchangeId={active.id}
      apps={apps}
      students={students}
      rollups={rollups}
      templates={templates}
      cellMap={grid.cellMap}
      applicationOpen={!!active.application_open}
      applicationDeadline={active.application_deadline ?? null}
      applySlug={active.apply_slug}
    />
  )
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run components/dashboard` then `pnpm test`
Expected: PASS everywhere (`PhaseStepper` still exists but is now unrendered — deleted in Task 4).

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/StudentDrawer.tsx "app/(organizer)/dashboard/page.tsx" components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): single lifecycle table replaces the two phase views"
```

---

### Task 3: Retire the old rollup API

Delete the now-unused `p1*`/`p2*` functions and switch the last consumer (Échanges page progress) to `exchangeProgress`.

**Files:**
- Modify: `app/(organizer)/exchanges/page.tsx`
- Modify: `lib/dashboard/rollup.ts` (deletions)
- Modify: `lib/dashboard/__tests__/rollup.test.ts` (prune)

**Interfaces:**
- Consumes: `exchangeProgress(apps, rollups)` from Task 1.
- Produces: `lib/dashboard/rollup.ts` no longer exports `p1Funnel`, `p1Filter`, `p1StatusPill`, `p1ResponsePill`, `p2Funnel`, `p2Filter`, `actionCards`, `reminderLine`, `overviewSubline`, `progress`.

- [ ] **Step 1: Switch the Échanges page.** In `app/(organizer)/exchanges/page.tsx`:

```ts
// import line, replace:
import { rollupStudent, progress, type AppRow } from '@/lib/dashboard/rollup'
// with:
import { rollupStudent, exchangeProgress, type AppRow } from '@/lib/dashboard/rollup'
```
```ts
// replace:
      const prog = phase === 1 ? progress(1, apps, []) : progress(2, [], rollups)
// with:
      const prog = exchangeProgress(apps, rollups)
```
(Keep `const phase = …` and the `phase` card field for now — they go in Task 4.)

- [ ] **Step 2: Delete from `lib/dashboard/rollup.ts`:** the functions `p1Funnel`, `p1Filter`, `p1StatusPill`, `p1ResponsePill`, `p2Funnel`, `p2Filter`, `countP1`, `actionCards`, `reminderLine`, `overviewSubline`, `progress` — and update the file-header comment to:

```ts
// Pure derivation library for the organizer dashboard (unified lifecycle view:
// candidature → dossier complet). No React, no Supabase — only Intl.
```
Keep: `p`, `CONFIRMED_STATUSES`, `ACCEPTED_GROUP_STATUSES` (used by `timelineFor`), `rollupStudent` (+ its private helpers), `formsPill`, `docsPill`, `nextDeadline`, `timelineFor`, `frShortDate` re-export, and everything added in Task 1.

- [ ] **Step 3: Prune `lib/dashboard/__tests__/rollup.test.ts`:**
  - Remove describes: `p1Funnel`, `p1Filter`, `pills`, `p2Funnel`, `p2Filter`.
  - In `copy builders`: remove the `it`s for old `actionCards` (×5), `reminderLine` (×3), `progress` (×2), `overviewSubline` (×2). Keep the `frShortDate` (×3) and `p` its.
  - Remove `APPS` fixture (only used by deleted tests); keep the `app` helper.
  - Fix the import list to drop the deleted names.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run lib/dashboard/__tests__/rollup.test.ts && pnpm test && pnpm lint`
Expected: PASS. Nothing else imports the deleted functions (verify: `grep -rn "p1Funnel\|p1Filter\|p1StatusPill\|p1ResponsePill\|p2Funnel\|p2Filter\|reminderLine\|overviewSubline" app components lib actions --include="*.ts*" | grep -v __tests__` → no hits).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts "app/(organizer)/exchanges/page.tsx"
git commit -m "refactor(dashboard): retire the p1/p2 rollup API in favor of the lifecycle API"
```

---

### Task 4: Phase removal sweep

Delete every remaining read/write of `phase` in code and UI. **No migration** — the DB columns stay.

**Files:**
- Delete: `components/dashboard/PhaseStepper.tsx`, `actions/__tests__/exchange-phase.test.ts`
- Modify: `actions/exchanges.ts`, `components/shell/OrganizerShell.tsx`, `app/(organizer)/layout.tsx`, `components/exchanges/ExchangesView.tsx`, `app/(organizer)/exchanges/page.tsx`, `components/settings/ProgramCard.tsx`, `actions/settings.ts`, `actions/forms.ts`
- Modify tests: `components/shell/__tests__/OrganizerShell.test.tsx`, `components/shell/__tests__/RailPrefetch.test.tsx`, `components/exchanges/__tests__/ExchangesView.test.tsx`, `components/settings/__tests__/SettingsView.test.tsx`, `actions/__tests__/forms-phase3.test.ts`

**Interfaces:**
- Produces: `ExchangeOption` (shell) = `{ id: string; name: string; year: number; archived: boolean }`; `ExchangeCardData` = `{ id: string; name: string; year: number; pct: number | null; pctLabel: string }`; `ProgramInfo` loses `phase`; `getTemplatesPage` return loses `phase`.

- [ ] **Step 1: Delete files**

```bash
git rm components/dashboard/PhaseStepper.tsx actions/__tests__/exchange-phase.test.ts
```

- [ ] **Step 2: `actions/exchanges.ts`** — delete the whole block from `export async function setExchangePhase` down through `stampChecklist` (the three functions `setExchangePhase`, `sendPhase2ChecklistOnce`, `stampChecklist` and their comments, currently lines 259–342), and remove the now-unused import:

```ts
import { sendPhase2ChecklistEmail } from '@/lib/email'
```
(`SupabaseClient`, `Database` imports stay — `assertExchangeInScope` uses them.)

- [ ] **Step 3: `components/shell/OrganizerShell.tsx`**

```ts
// replace:
export type ExchangeOption = { id: string; name: string; year: number; phase: 1 | 2; archived: boolean }
// with:
export type ExchangeOption = { id: string; name: string; year: number; archived: boolean }
```
Replace the header pill block:
```tsx
                <span
                  className={cn(
                    'rounded-pill px-3 py-1 font-mono text-[11px] font-semibold',
                    active.archived ? 'bg-subtle text-muted-foreground' : 'bg-tint text-tint-text'
                  )}
                >
                  {active.archived
                    ? 'Archivé'
                    : active.phase === 1 ? 'Phase 1 · Recrutement' : 'Phase 2 · Préparation'}
                </span>
```
with (pill only for archived exchanges):
```tsx
                {active.archived && (
                  <span className="rounded-pill bg-subtle px-3 py-1 font-mono text-[11px] font-semibold text-muted-foreground">
                    Archivé
                  </span>
                )}
```

- [ ] **Step 4: `app/(organizer)/layout.tsx`**

```ts
// select line, replace:
    .select('id, name, year, phase, archived_at, school_a_id')
// with:
    .select('id, name, year, archived_at, school_a_id')
```
```ts
// mapping, replace:
  const exchanges: ExchangeOption[] = rows.map(e => ({
    id: e.id, name: e.name, year: e.year, phase: e.phase, archived: !!e.archived_at,
  }))
// with:
  const exchanges: ExchangeOption[] = rows.map(e => ({
    id: e.id, name: e.name, year: e.year, archived: !!e.archived_at,
  }))
```

- [ ] **Step 5: `components/exchanges/ExchangesView.tsx`** — remove `phase: 1 | 2` from `ExchangeCardData`, delete the `PHASE_LABEL` const, remove `phase` from the `ExchangeCard` destructure, and delete the phase pill span:

```tsx
        <span className="rounded-pill bg-tint text-tint-text px-2.5 py-0.5 font-mono text-[11px]">
          {PHASE_LABEL[phase]}
        </span>
```

- [ ] **Step 6: `app/(organizer)/exchanges/page.tsx`** — delete the line `const phase = (exchange.phase ?? 1) as 1 | 2` and the `phase,` field in the returned card object.

- [ ] **Step 7: `components/settings/ProgramCard.tsx`** — replace the pill ternary:

```tsx
            {program.archived ? (
              <span className="rounded-pill bg-subtle px-2.5 py-[3px] text-[11px] font-semibold text-muted-foreground">Archivé</span>
            ) : (
              <span className="rounded-pill bg-tint px-2.5 py-[3px] text-[11px] font-semibold text-tint-text">
                {program.phase === 1 ? 'Phase 1 · Recrutement' : 'Phase 2 · Préparation'}
              </span>
            )}
```
with:
```tsx
            {program.archived && (
              <span className="rounded-pill bg-subtle px-2.5 py-[3px] text-[11px] font-semibold text-muted-foreground">Archivé</span>
            )}
```

- [ ] **Step 8: `actions/settings.ts`** — three edits:
  - `ProgramInfo`: `phase: 1 | 2; ` removed from the type.
  - `getScopedExchange` select: `'id, name, year, phase, archived_at, school_a_id, school_b_id'` → `'id, name, year, archived_at, school_a_id, school_b_id'`.
  - `getProgramInfo` return: remove `phase: (exchange.phase ?? 1) as 1 | 2,`.

- [ ] **Step 9: `actions/forms.ts`** — three edits:
  - In `activateTemplate`, delete the phase-2 immediate-notify block (newly activated templates reach students via the daily reminder engine, per spec):
    ```ts
      // Exchange already in Phase 2 → tell the newly assigned students now
      // (otherwise the Phase-2 checklist email / daily cron covers it).
      const { data: exchange } = await supabase
        .from('exchanges').select('phase, name').eq('id', tmpl.exchange_id).single()
      if (exchange?.phase === 2) {
        const activated = { ...tmpl, status: 'active' as const }
        await notifyIncompleteAssignees(supabase, activated, exchange.name, 0)
      }
    ```
  - Simplify `notifyIncompleteAssignees` (now only called by `remindTemplate`): drop the `cooldownMs` parameter, use `REMIND_COOLDOWN_MS` directly (`const cutoff = Date.now() - REMIND_COOLDOWN_MS`), replace the guard `if (cooldownMs > 0 && row.last_reminded_at && …)` with `if (row.last_reminded_at && …)`, update its doc comment to `// Emails incomplete assignees of a template (24 h cooldown). Used by remindTemplate.`, and drop the last argument at the `remindTemplate` call site. Move the `const REMIND_COOLDOWN_MS` declaration above the function if needed.
  - In `getTemplatesPage`: remove `phase: 1 | 2` from the return type, change the select to `'name, school_a_id, school_b_id'`, and remove `phase: (exchange.phase ?? 1) as 1 | 2,` from the return. (No page consumes it — verified.)

- [ ] **Step 10: Test updates**
  - `components/shell/__tests__/OrganizerShell.test.tsx`: remove `phase: 1 as const,` from both exchange fixtures; delete the two assertions `expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()` and `expect(screen.queryByText('Phase 1 · Recrutement')).toBeNull()` (the `Archivé` assertion stays).
  - `components/shell/__tests__/RailPrefetch.test.tsx`: remove `phase: 1 as const,` from the fixture.
  - `components/exchanges/__tests__/ExchangesView.test.tsx`: remove `phase: 1 as const,` from `ex`; rename the test to `'exchange card shows name, year and progress'` and replace `expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()` with `expect(screen.getByText('2026')).toBeInTheDocument()`.
  - `components/settings/__tests__/SettingsView.test.tsx`: remove `phase: 2 as const,` from the `program` fixture.
  - `actions/__tests__/forms-phase3.test.ts`: change both occurrences of `exchange = { phase: 1, name: 'Espagne' }` to `exchange = { name: 'Espagne' }` (declaration and `beforeEach`).

- [ ] **Step 11: Run the gate**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green. Then confirm no residue: `grep -rn "setExchangePhase\|PhaseStepper\|Phase 1 · Recrutement\|Phase 2 · Préparation\|phase2_checklist\|\.phase\b" app components lib actions --include="*.ts*"` → no hits (generated `types/supabase.ts` may still mention the columns; that's expected).

- [ ] **Step 12: Commit** (the two deletions from Step 1 are already staged by `git rm` — don't re-add them)

```bash
git add actions/exchanges.ts actions/settings.ts actions/forms.ts \
  components/shell/OrganizerShell.tsx components/exchanges/ExchangesView.tsx components/settings/ProgramCard.tsx \
  "app/(organizer)/layout.tsx" "app/(organizer)/exchanges/page.tsx" \
  components/shell/__tests__/OrganizerShell.test.tsx components/shell/__tests__/RailPrefetch.test.tsx \
  components/exchanges/__tests__/ExchangesView.test.tsx components/settings/__tests__/SettingsView.test.tsx \
  actions/__tests__/forms-phase3.test.ts
git commit -m "feat: remove the phase concept from shell, cards, settings and actions"
```

---

### Task 5: Checklist email at enrollment

**Files:**
- Modify: `lib/email.ts` (rename), `actions/invitations.ts` (send at enrollment)
- Create test: `actions/__tests__/enrollment-checklist.test.ts`
- Modify tests: `lib/__tests__/email.forms.test.ts`, `lib/__tests__/email-french-copy.test.ts`, `actions/__tests__/applications.test.ts`

**Interfaces:**
- Produces: `sendChecklistEmail(opts: { to: string; studentName: string; exchangeName: string; items: { name: string; deadline: string | null }[]; ctx?: EmailLogContext }): Promise<boolean>` in `lib/email.ts` (same body/copy as the old `sendPhase2ChecklistEmail`; log label becomes `'checklist email'`).

- [ ] **Step 1: Rename in `lib/email.ts`** — `export async function sendPhase2ChecklistEmail` → `export async function sendChecklistEmail`; in its `send(...)` call change the label `'phase-2 checklist email'` → `'checklist email'`. Copy (subject « c’est parti ! », body « qu’il reste à compléter ») unchanged.

- [ ] **Step 2: Update the two email test files** (mechanical rename):
  - `lib/__tests__/email.forms.test.ts`: import + call `sendChecklistEmail`.
  - `lib/__tests__/email-french-copy.test.ts`: import list, `it('sendPhase2ChecklistEmail', …)` → `it('sendChecklistEmail', …)`, and the call.

Run: `pnpm vitest run lib/__tests__/email.forms.test.ts lib/__tests__/email-french-copy.test.ts` → PASS.

- [ ] **Step 3: Write the failing enrollment test** — create `actions/__tests__/enrollment-checklist.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const checklistMock = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendChecklistEmail: (...a: unknown[]) => checklistMock(...a),
}))

// ---- switchable state ----
let activeTemplates: any[] = []
let assignmentRows: any[] = []
const applicationUpdates: any[] = []

const CLAIMED = {
  id: 'app-1', email: 'lea@x.fr', school_id: 'school-1', exchange_id: 'ex-1',
  data: { first_name: 'Léa', last_name: 'Martin' },
}

// Chainable stub that terminates as single/maybeSingle and is also directly
// awaitable (the checklist helper awaits .select().eq().eq().eq() chains).
function chain(data: any) {
  const c: any = {
    eq: () => c, in: () => c, select: () => c,
    single: async () => ({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: any) => resolve({ data, error: null }),
  }
  return c
}

const adminClient = {
  from: (table: string) => {
    if (table === 'applications') {
      return {
        // pre-check: not expired, points at ex-1
        select: () => chain({ id: 'app-1', invite_token_expires_at: null, exchange_id: 'ex-1' }),
        // claim (maybeSingle) + finalize (direct await) both land here
        update: (row: any) => { applicationUpdates.push(row); return chain(CLAIMED) },
      }
    }
    if (table === 'exchanges') {
      // archived_at → assertExchangeWritable; name → checklist helper
      return { select: (cols: string) => (cols === 'name' ? chain({ name: 'Espagne 2026' }) : chain({ archived_at: null })) }
    }
    if (table === 'form_templates') return { select: () => chain(activeTemplates) }
    if (table === 'assignments') return { select: () => chain(assignmentRows) }
    if (table === 'users') return { insert: () => Promise.resolve({ error: null }) }
    if (table === 'exchange_enrollments') return { insert: () => Promise.resolve({ error: null }) }
    return { select: () => chain(null) }
  },
  auth: { admin: {
    inviteUserByEmail: async () => ({ data: { user: { id: 'stu-1' } }, error: null }),
    deleteUser: async () => ({ error: null }),
  } },
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))

import { respondToInvitation } from '@/actions/invitations'

describe('enrollment checklist email (respondToInvitation « yes »)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    checklistMock.mockClear()
    checklistMock.mockResolvedValue(true)
    applicationUpdates.length = 0
    activeTemplates = []
    assignmentRows = []
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => { warnSpy.mockRestore() })

  it('sends one checklist listing only the pending items', async () => {
    activeTemplates = [
      { id: 't1', name: 'Passeport', deadline: '2026-10-10' },
      { id: 't2', name: 'Fiche santé', deadline: null },
    ]
    assignmentRows = [
      { template_id: 't1', submissions: null },                     // pending
      { template_id: 't2', submissions: { status: 'approved' } },   // done
    ]
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).toHaveBeenCalledTimes(1)
    const call = checklistMock.mock.calls[0][0]
    expect(call.to).toBe('lea@x.fr')
    expect(call.studentName).toBe('Léa Martin')
    expect(call.exchangeName).toBe('Espagne 2026')
    expect(call.items).toEqual([{ name: 'Passeport', deadline: '2026-10-10' }])
  })

  it('skips the email when nothing is pending', async () => {
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    assignmentRows = [{ template_id: 't1', submissions: { status: 'approved' } }]
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).not.toHaveBeenCalled()
  })

  it('skips the email when no template is active', async () => {
    await respondToInvitation('inv-1', 'yes', '')
    expect(checklistMock).not.toHaveBeenCalled()
  })

  it('an email failure never breaks the enrollment', async () => {
    activeTemplates = [{ id: 't1', name: 'Passeport', deadline: '2026-10-10' }]
    assignmentRows = [{ template_id: 't1', submissions: null }]
    checklistMock.mockRejectedValueOnce(new Error('smtp down'))
    await expect(respondToInvitation('inv-1', 'yes', '')).resolves.toBeUndefined()
    // enrollment was finalized despite the email failure
    expect(applicationUpdates.some(u => u.status === 'enrolled')).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
    // never log the student email (PII)
    expect(String(warnSpy.mock.calls[0][0])).not.toContain('lea@x.fr')
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm vitest run actions/__tests__/enrollment-checklist.test.ts`
Expected: FAIL — no checklist email is sent yet (first test).

- [ ] **Step 5: Implement in `actions/invitations.ts`:**

(a) Add the import:
```ts
import { sendChecklistEmail } from '@/lib/email'
```
(b) In the « yes » claim, add `data` to the select:
```ts
    .select('id, email, school_id, exchange_id, data').maybeSingle()
```
(c) After the finalize block (`if (finalErr) throw finalErr`), before the closing comment, add:
```ts
  // One checklist email at enrollment: the DB trigger
  // (trg_assign_on_enrollment_insert) has just fanned out the assignments,
  // so list what's pending. Best-effort — never breaks the enrollment.
  await sendEnrollmentChecklist(admin, {
    userId,
    email: claimed.email,
    studentName: buildApplicantName(claimed.data as Record<string, string> | null),
    schoolId: claimed.school_id,
    exchangeId: claimed.exchange_id,
  })
```
(d) Append the helper at the end of the file (non-exported async helpers are fine in a `'use server'` file — only *exports* must be async functions):
```ts
async function sendEnrollmentChecklist(
  admin: ReturnType<typeof createAdminClient>,
  opts: { userId: string; email: string; studentName: string; schoolId: string; exchangeId: string },
): Promise<void> {
  try {
    const [{ data: exchange }, { data: templates }] = await Promise.all([
      admin.from('exchanges').select('name').eq('id', opts.exchangeId).single(),
      admin.from('form_templates')
        .select('id, name, deadline')
        .eq('exchange_id', opts.exchangeId).eq('school_id', opts.schoolId).eq('status', 'active'),
    ])
    if (!exchange || !templates || templates.length === 0) return

    const templateById = new Map(templates.map(t => [t.id, t]))
    const { data: assignments } = await admin
      .from('assignments')
      .select('template_id, submissions(status)')
      .eq('student_id', opts.userId)
      .in('template_id', templates.map(t => t.id))

    const items: { name: string; deadline: string | null }[] = []
    for (const a of assignments ?? []) {
      const submission = Array.isArray(a.submissions) ? a.submissions[0] : a.submissions
      const status = submission?.status ?? null
      if (status === 'submitted' || status === 'approved') continue
      const t = templateById.get(a.template_id)
      if (t) items.push({ name: t.name, deadline: t.deadline })
    }
    if (items.length === 0) return

    await sendChecklistEmail({
      to: opts.email, studentName: opts.studentName, exchangeName: exchange.name, items,
      ctx: { schoolId: opts.schoolId, exchangeId: opts.exchangeId },
    })
  } catch {
    // Never log the student email (PII); the enrollment itself already succeeded.
    console.warn('[invitations] enrollment checklist email failed — enrollment unaffected')
  }
}
```

- [ ] **Step 6: Update `actions/__tests__/applications.test.ts`** — add to the `@/lib/email` mock factory:

```ts
  sendChecklistEmail: vi.fn().mockResolvedValue(true),
```
(Its generic builder returns non-thenable chains for `form_templates`, so the helper exits early there — the existing `respondToInvitation` tests stay valid.)

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run actions/__tests__/enrollment-checklist.test.ts actions/__tests__/applications.test.ts` then `pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/email.ts actions/invitations.ts actions/__tests__/enrollment-checklist.test.ts actions/__tests__/applications.test.ts lib/__tests__/email.forms.test.ts lib/__tests__/email-french-copy.test.ts
git commit -m "feat(invitations): per-student checklist email at enrollment replaces the phase-2 blast"
```

---

### Task 6: Final gate

- [ ] **Step 1: Full verification**

Run: `pnpm lint && pnpm test && npx tsc --noEmit`
Expected: all green. (`pnpm build` fails locally because `.env.local` has placeholders — `tsc --noEmit` is the local equivalent; CI runs the real build.)

- [ ] **Step 2: Residue sweep**

Run: `grep -rn "sendPhase2ChecklistEmail\|setExchangePhase\|PhaseStepper\|Phase 1 · Recrutement\|Phase 2 · Préparation" app components lib actions --include="*.ts*"`
Expected: no output.

- [ ] **Step 3: Commit any leftovers, then hand off** via superpowers:finishing-a-development-branch (PR against `main`; **no push to main, no prod deploy** — CI deploys on merge).

---

## Self-review notes (spec coverage)

- Spec §UX header/subline → Task 1 `lifecycleSubline`, Task 2 header. Funnel card + tiles incl. « x / y » → Task 1 `lifecycleFunnel.display`, Task 2. Table columns / applicant vs enrolled rows / drawer per kind → Tasks 1–2. Hidden closed rows + link → Tasks 1–2. Right rail cards only → Tasks 1–2. Empty state → Task 2 (with the directly-invited fix).
- Spec §Data & derivation: dedupe by email, fallback Confirmé row, Candidatures counts closed → Task 1 (tested).
- Spec §Phase removal sweep: every listed item → Task 4, plus the two spec gaps in `actions/forms.ts`.
- Spec §Checklist email on enrollment: rename, send in « yes » path, no-pending skip, non-blocking failure → Task 5 (tested).
- Spec §Testing: rollup rewrite (T1/T3), OverviewView tests (T2), shell/exchanges/settings drops (T4), delete `exchange-phase.test.ts` + new enrollment tests (T4/T5), gate (T6).
