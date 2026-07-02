# Redesign Phase 2: Dashboard Views (Aperçu / Échanges / Candid.) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the organizer dashboard with the handoff's three session-scoped views — Aperçu (`/dashboard`), Échanges (`/exchanges`), Candidatures (`/applications`) — including the phase stepper, student drawer, bulk accept/reject, and full application detail, absorbing the old `exchanges/[id]/applications` pages.

**Architecture:** A pure derivation library (`lib/dashboard/rollup.ts`) maps existing application statuses and assignment/submission grids to the design's funnel counts, pills, action cards, and progress; server pages fetch via existing actions (`listApplications`, `getExchangeGrid`) plus one new column (`exchanges.phase`) and pass serializable props to client view components. Bulk actions wrap the existing single accept/reject actions.

**Tech Stack:** Next.js 14 App Router, Supabase (one migration), Tailwind tokens from Phase 1, shadcn/ui, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-02-redesign-phase2-dashboard-design.md`
**Design reference:** unzip `docs/Eazyexchange student exchange platform.zip` → `design_handoff_eazyexchange/Eazyexchange Dashboard.dc.html`. Its embedded `<script type="text/x-dc">` block is the authoritative source for pill mappings, funnel keys, action-card copy, drawer timeline strings, and the application-detail layout; open the file in a browser (keep `support.js` beside it) to inspect rendering.

## Global Constraints

- Package manager is **pnpm** (never npm).
- Verification: `pnpm lint`, `pnpm test`, `npx tsc --noEmit`. Do NOT run `pnpm build` (placeholder local env fails it by design).
- **Never log student/parent PII** (no names, emails, or application contents in logs/errors).
- All new view copy is **French, vouvoiement**, byte-exact as given in this plan (copied from the handoff). Existing English page copy elsewhere stays.
- Branch: `redesign/phase-2-dashboard`. Never push/merge to `main` without explicit user confirmation (merge = production deploy).
- Plan names/caps: **Starter — 2 échanges ($299 / an), Growth — 6 échanges ($499 / an, POPULAIRE), Scale — Échanges illimités ($599 / an)**. The handoff demo's «Essentiel/Association/Réseau» names are stale — never use them.
- Phase-1 Tailwind tokens available: colors `navy`, `rail`, `rail-inactive`, `brand`, `brand-hover`, `brand-accent`, `tint`, `tint-border`, `tint-text`, `success`, `success-text`, `warn`, `warn-text`, `danger`, `danger-text`, `subtle`, `hoverrow`, `hoverrow-soft`, `hint`, `placeholder`, `tertiary`, `track`, `frame`, `frame-dashed`; radii `rounded-card` (18px), `rounded-pill`; shadows `shadow-float`, `shadow-modal`; fonts `font-sans` (IBM Plex Sans), `font-display` (Schibsted Grotesk), `font-mono` (IBM Plex Mono).
- Pill visual style (all status pills): `inline-flex items-center px-2.5 py-[3px] rounded-pill text-[11px] font-semibold whitespace-nowrap` + kind classes — ok: `bg-success text-success-text`; warn: `bg-warn text-warn-text`; info: `bg-tint text-tint-text`; bad: `bg-danger text-danger-text`; neutral: `bg-subtle text-muted-foreground`.
- The migration must be applied to the Supabase project (`supabase db push`, IPv4 pooler if IPv6 hangs — see repo memory) **before merging** code that reads `phase`. Task 9 handles this with the user.

---

### Task 1: Migration `exchanges.phase` + `setExchangePhase` action

**Files:**
- Create: `supabase/migrations/20260702000001_exchange_phase.sql`
- Modify: `actions/exchanges.ts` (append action)
- Test: `actions/__tests__/exchange-phase.test.ts` (create)

**Interfaces:**
- Produces: `exchanges.phase` column (smallint 1|2, default 1); `setExchangePhase(exchangeId: string, phase: 1 | 2): Promise<void>` exported from `actions/exchanges.ts`.
- Consumes: existing `assertExchangeInScope(supabase, userId, exchangeId)` (private helper already in `actions/exchanges.ts`).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b redesign/phase-2-dashboard
```

- [ ] **Step 2: Write the migration**

`supabase/migrations/20260702000001_exchange_phase.sql`:

```sql
-- Phase of an exchange's lifecycle, toggled by the organizer from the
-- dashboard stepper. 1 = Recrutement & sélection, 2 = Préparation des dossiers.
-- The existing "organizers update exchanges" RLS policy already permits this
-- update; the guard trigger only blocks school_a_id/school_b_id changes.
alter table exchanges add column phase smallint not null default 1 check (phase in (1, 2));
```

Do NOT run `supabase db push` — the controller applies it with the user in Task 9. Unit tests mock supabase and don't need the live column.

- [ ] **Step 3: Write the failing action test**

`actions/__tests__/exchange-phase.test.ts` — follow the mock style of `actions/__tests__/create-exchange.test.ts` (module-level `vi.mock` of `@/lib/supabase/server` returning a chainable stub). Test cases:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq: updateEq }))

// Chainable query stub: users profile lookup + exchanges scope lookup + update
const from = vi.fn((table: string) => {
  if (table === 'users') {
    return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { school_id: 'school-1' } }) }) }) }
  }
  // exchanges
  return {
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { school_a_id: 'school-1', school_b_id: 'school-2' } }) }) }),
    update,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setExchangePhase } from '@/actions/exchanges'

describe('setExchangePhase', () => {
  beforeEach(() => { update.mockClear(); updateEq.mockClear() })

  it('updates the phase for an in-scope exchange', async () => {
    await setExchangePhase('ex-1', 2)
    expect(update).toHaveBeenCalledWith({ phase: 2 })
    expect(updateEq).toHaveBeenCalledWith('id', 'ex-1')
  })

  it('rejects an invalid phase value', async () => {
    // @ts-expect-error deliberately invalid
    await expect(setExchangePhase('ex-1', 3)).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm test exchange-phase`
Expected: FAIL — `setExchangePhase` is not exported.

- [ ] **Step 5: Implement the action**

Append to `actions/exchanges.ts` (after `setApplicationOpen`):

```ts
export async function setExchangePhase(exchangeId: string, phase: 1 | 2): Promise<void> {
  if (phase !== 1 && phase !== 2) throw new Error('Invalid phase')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  await assertExchangeInScope(supabase, user.id, exchangeId)

  const { error } = await supabase.from('exchanges').update({ phase }).eq('id', exchangeId)
  if (error) throw error
  revalidatePath('/dashboard')
}
```

- [ ] **Step 6: Run to verify pass, full gates**

Run: `pnpm test exchange-phase` → PASS (2 tests). Then `pnpm lint && npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260702000001_exchange_phase.sql actions/exchanges.ts actions/__tests__/exchange-phase.test.ts
git commit -m "feat(dashboard): exchanges.phase column + setExchangePhase action"
```

---

### Task 2: Derivation library `lib/dashboard/rollup.ts`

**Files:**
- Create: `lib/dashboard/rollup.ts`
- Test: `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions). Input shapes mirror `listApplications` rows and `getExchangeGrid` output (`templates`, `students`, `cellMap`).
- Produces (exact exports later tasks import):

```ts
export type Pill = { kind: 'ok' | 'warn' | 'info' | 'bad' | 'neutral'; label: string }
export type AppRow = { id: string; status: string; submitted_at: string | null; data: Record<string, string>; email: string }
export type TemplateInfo = { id: string; type: 'data_entry' | 'document_upload'; name: string; deadline: string }
export type CellMap = Record<string, { assignmentId: string; status?: string }> // key `${studentId}:${templateId}`
export type StudentInfo = { id: string; full_name: string }
export type DossierRollup = {
  studentId: string; name: string
  forms: 'complete' | 'pending' | 'missing'
  docs: 'complete' | 'review' | 'pending' | 'missing'
  due: string | null   // ISO date of earliest incomplete deadline
  late: boolean
  overall: Pill
}
export type FunnelStage = { key: string; label: string; count: number }
export type ActionCard = { title: string; desc: string; cta: string; tone: 'accent' | 'warn' | 'bad'; filterKey: string }

export function frShortDate(iso: string | null): string            // '2026-09-12' → '12 sept' ('' for null)
export function p1Funnel(apps: AppRow[]): FunnelStage[]
export function p1Filter(apps: AppRow[], key: string | null): AppRow[]
export function p1StatusPill(status: string): Pill
export function p1ResponsePill(status: string): Pill | null        // null renders plain '—'
export function rollupStudent(student: StudentInfo, templates: TemplateInfo[], cellMap: CellMap, today?: Date): DossierRollup
export function p2Funnel(rollups: DossierRollup[]): FunnelStage[]
export function p2Filter(rollups: DossierRollup[], key: string | null): DossierRollup[]
export function formsPill(f: DossierRollup['forms']): Pill
export function docsPill(d: DossierRollup['docs']): Pill
export function actionCards(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): ActionCard[]
export function reminderLine(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): string
export function overviewSubline(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): string
export function progress(phase: 1 | 2, apps: AppRow[], rollups: DossierRollup[]): { done: number; total: number; label: string }
export function nextDeadline(rollups: DossierRollup[]): string | null  // earliest incomplete due (ISO) across students
export function timelineFor(app: AppRow): { dot: Pill['kind']; title: string; sub: string }[]
```

**Exact mappings (the core of this task — implement precisely):**

Status vocabulary (applications): `submitted, rejected, accepted, declined, maybe, enrolling, enrolled` (drafts never reach the dashboard — `listApplications` filters them).

- `p1Funnel` stages, in order: `all` «Reçues» = all rows; `toreview` «À examiner» = `submitted`; `accepted` «Acceptés» = `accepted|maybe|declined|enrolling|enrolled`; `waiting` «En attente» = `accepted`; `confirmed` «Confirmés» = `enrolling|enrolled`. `p1Filter(apps, key)` applies the same predicates; `null` or `'all'` → all rows. Extra filter keys usable by action cards: `'maybe'` → `maybe` rows.
- `p1StatusPill`: submitted → neutral «À examiner»; accepted → warn «En attente»; enrolling|enrolled → ok «Confirmé»; maybe → warn «Hésite»; declined → bad «A décliné»; rejected → bad «Refusé»; unknown → neutral «—».
- `p1ResponsePill`: enrolling|enrolled → ok «Oui»; maybe → warn «Peut-être»; declined → bad «Non»; else `null`.
- `rollupStudent` — per-assignment state from `cellMap[`${student.id}:${template.id}`]`: no entry or no `status` or `status === 'draft'` or `'rejected'` → *incomplete/not-started* (started iff a submission row exists, i.e. entry has a `status`); `'submitted'` → *awaiting review*; `'approved'` → *done*.
  - `forms` (templates with `type === 'data_entry'`): every assignment submitted|approved → `'complete'`; no assignment has any submission → `'missing'`; else `'pending'`. No data_entry templates at all → `'complete'`.
  - `docs` (`type === 'document_upload'`): any submitted (awaiting review) → `'review'`; else every one approved → `'complete'`; else none has any submission → `'missing'`; else `'pending'`. No doc templates → `'complete'`.
  - `due`: earliest `deadline` among assignments not submitted|approved; `null` if none. `late`: `today` (default `new Date()`) is after that deadline (compare date-only).
  - `overall` precedence: `docs === 'review'` → info «À vérifier»; `forms==='complete' && docs==='complete'` → ok «Complet»; `late` → bad «En retard»; else warn «Incomplet».
- `formsPill`: complete → ok «Reçu»; pending → warn «En cours»; missing → bad «Manquant».
- `docsPill`: complete → ok «Complet»; review → info «À vérifier»; pending → warn «En cours»; missing → bad «Manquant».
- `p2Funnel` stages: `p2all` «Confirmés» = all rollups; `pendingforms` «Formul. en attente» = `forms !== 'complete'`; `review` «À vérifier» = `overall.kind === 'info'`; `missingdocs` «Docs manquants» = `docs === 'missing' || docs === 'pending'`; `late` «En retard» = `late`.
- `actionCards` — French plural helper `p(n) = n > 1 ? 's' : ''`. Phase 1 (from apps): if `toreview` count `a > 0` → `{ title: `${a} candidature${p(a)} à examiner`, desc: 'Nouveaux dossiers en attente de votre décision. L’invitation part automatiquement dès l’acceptation.', cta: 'Examiner', tone: 'accent', filterKey: 'toreview' }`; if `maybe` count `c > 0` → `{ title: `${c} élève${p(c)} hésite${c > 1 ? 'nt' : ''} — à relancer`, desc: 'Réponses « Peut-être » à convertir en confirmation.', cta: 'Relancer', tone: 'warn', filterKey: 'maybe' }`. Phase 2 (from rollups): review count `r` → `{ title: `${r} dossier${p(r)} à vérifier`, desc: 'Formulaires et documents reçus, en attente de validation.', cta: 'Vérifier', tone: 'accent', filterKey: 'review' }`; missingdocs count `m` → `{ title: `${m} élève${p(m)} : documents manquants`, desc: 'Pièces non reçues avant l’échéance.', cta: 'Voir les élèves', tone: 'warn', filterKey: 'missingdocs' }`; late count `l` → `{ title: `${l} élève${p(l)} en retard`, desc: 'Échéance dépassée — relance renforcée en cours.', cta: 'Relancer', tone: 'bad', filterKey: 'late' }`. Zero-count cards are omitted.
- `reminderLine`: P1 N = waiting + maybe counts → `Relance automatique demain 8h — ${N} élève${p(N)} relancé${p(N)} sur leur candidature ou leur réponse, avec la date limite.`; P2 N = missingdocs + pendingforms → `Relance automatique demain 8h — ${N} élève${p(N)} relancé${p(N)} sur les documents manquants, avec la date limite.`
- `overviewSubline`: P1 → `Phase 1 · Recrutement — ${a} candidature${p(a)} à examiner, ${c} élève${p(c)} déjà confirmé${p(c)}.` (a = toreview, c = confirmed); P2 → `Phase 2 · Préparation — ${r} dossier${p(r)} à vérifier, ${m} en attente de documents.` (r = review, m = missingdocs).
- `progress`: P1 done = apps with `status !== 'submitted'`, total = all, label `${done} / ${total} candidatures traitées`; P2 done = rollups with forms complete && docs complete, total = all, label `${done} / ${total} dossiers validés`. Guard division by zero (pct handled by callers as `total === 0 ? 0 : round(done/total*100)`).
- `frShortDate('2026-09-12')` → `'12 sept'` — implement with `new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })` on a `new Date(iso + 'T00:00:00')`, then strip a trailing `'.'` (fr-FR renders «sept.»). Null/empty → `''`.
- `timelineFor(app)` (drawer « Parcours »): always `{ dot: 'ok', title: 'Candidature reçue', sub: frShortDate(app.submitted_at) }`; then by status — submitted → `{ dot: 'neutral', title: 'En attente d’examen', sub: 'À accepter ou refuser' }`; rejected → `{ dot: 'bad', title: 'Candidature refusée', sub: '' }`; accepted|maybe|declined|enrolling|enrolled → `{ dot: 'ok', title: 'Candidature acceptée', sub: '' }` **and** `{ dot: 'ok', title: 'Invitation envoyée automatiquement', sub: 'Email envoyé dès l’acceptation' }`; then accepted → `{ dot: 'warn', title: 'En attente de réponse', sub: '' }`; enrolling|enrolled → `{ dot: 'ok', title: 'A répondu : Oui', sub: 'Participation confirmée' }`; maybe → `{ dot: 'warn', title: 'A répondu : Peut-être', sub: '' }`; declined → `{ dot: 'bad', title: 'A répondu : Non', sub: '' }`.

- [ ] **Step 1: Write the failing tests**

`lib/dashboard/__tests__/rollup.test.ts` — table-driven; cover at minimum:

```ts
import { describe, it, expect } from 'vitest'
import {
  frShortDate, p1Funnel, p1Filter, p1StatusPill, p1ResponsePill,
  rollupStudent, p2Funnel, formsPill, docsPill, actionCards,
  reminderLine, overviewSubline, progress, timelineFor, nextDeadline,
  type AppRow, type TemplateInfo, type CellMap,
} from '@/lib/dashboard/rollup'

const app = (status: string, over: Partial<AppRow> = {}): AppRow =>
  ({ id: Math.random().toString(), status, submitted_at: '2026-09-12', data: {}, email: 'x@y.fr', ...over })

const APPS = [app('submitted'), app('submitted'), app('accepted'), app('maybe'), app('declined'), app('enrolled'), app('rejected')]

describe('p1Funnel', () => {
  it('counts every stage per the design mapping', () => {
    const f = Object.fromEntries(p1Funnel(APPS).map(s => [s.key, s.count]))
    expect(f).toEqual({ all: 7, toreview: 2, accepted: 4, waiting: 1, confirmed: 1 })
  })
  it('labels are the French design strings in order', () => {
    expect(p1Funnel([]).map(s => s.label)).toEqual(['Reçues', 'À examiner', 'Acceptés', 'En attente', 'Confirmés'])
  })
})

describe('pills', () => {
  it.each([
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'En attente'],
    ['enrolled', 'ok', 'Confirmé'], ['enrolling', 'ok', 'Confirmé'],
    ['maybe', 'warn', 'Hésite'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
  ])('%s → %s %s', (s, kind, label) => expect(p1StatusPill(s)).toEqual({ kind, label }))
  it('response pill', () => {
    expect(p1ResponsePill('enrolled')).toEqual({ kind: 'ok', label: 'Oui' })
    expect(p1ResponsePill('maybe')).toEqual({ kind: 'warn', label: 'Peut-être' })
    expect(p1ResponsePill('declined')).toEqual({ kind: 'bad', label: 'Non' })
    expect(p1ResponsePill('submitted')).toBeNull()
  })
})

const T: TemplateInfo[] = [
  { id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' },
  { id: 'd1', type: 'document_upload', name: 'Passeport', deadline: '2026-10-10' },
]
const student = { id: 's1', full_name: 'Camille Laurent' }
const cell = (f1?: string, d1?: string): CellMap => {
  const m: CellMap = {}
  if (f1 !== undefined) m['s1:f1'] = { assignmentId: 'a1', status: f1 || undefined }
  if (d1 !== undefined) m['s1:d1'] = { assignmentId: 'a2', status: d1 || undefined }
  return m
}
const TODAY = new Date('2026-09-20T12:00:00')

describe('rollupStudent', () => {
  it('complete dossier', () => {
    const r = rollupStudent(student, T, cell('approved', 'approved'), TODAY)
    expect(r.forms).toBe('complete'); expect(r.docs).toBe('complete')
    expect(r.overall).toEqual({ kind: 'ok', label: 'Complet' }); expect(r.due).toBeNull(); expect(r.late).toBe(false)
  })
  it('doc awaiting review wins overall', () => {
    const r = rollupStudent(student, T, cell('approved', 'submitted'), TODAY)
    expect(r.docs).toBe('review'); expect(r.overall).toEqual({ kind: 'info', label: 'À vérifier' })
  })
  it('nothing started → missing + due', () => {
    const r = rollupStudent(student, T, cell('', ''), TODAY)
    expect(r.forms).toBe('missing'); expect(r.docs).toBe('missing'); expect(r.due).toBe('2026-10-10'); expect(r.late).toBe(false)
  })
  it('late when past deadline and incomplete', () => {
    const r = rollupStudent(student, T, cell('draft', ''), new Date('2026-10-11T12:00:00'))
    expect(r.late).toBe(true); expect(r.overall).toEqual({ kind: 'bad', label: 'En retard' })
  })
  it('no templates → complete', () => {
    const r = rollupStudent(student, [], {}, TODAY)
    expect(r.overall).toEqual({ kind: 'ok', label: 'Complet' })
  })
})

describe('copy builders', () => {
  it('action cards P1 pluralize and omit zero counts', () => {
    const cards = actionCards(1, [app('submitted'), app('submitted'), app('maybe')], [])
    expect(cards.map(c => c.title)).toEqual(['2 candidatures à examiner', '1 élève hésite — à relancer'])
    expect(actionCards(1, [app('enrolled')], [])).toEqual([])
  })
  it('reminder line P1 counts waiting + maybe', () => {
    expect(reminderLine(1, [app('accepted'), app('maybe')], []))
      .toBe('Relance automatique demain 8h — 2 élèves relancés sur leur candidature ou leur réponse, avec la date limite.')
  })
  it('progress P1', () => {
    expect(progress(1, [app('submitted'), app('enrolled')], []))
      .toEqual({ done: 1, total: 2, label: '1 / 2 candidatures traitées' })
  })
  it('frShortDate strips the dot', () => {
    expect(frShortDate('2026-09-12')).toBe('12 sept')
    expect(frShortDate(null)).toBe('')
  })
})

describe('timelineFor', () => {
  it('submitted app', () => {
    expect(timelineFor(app('submitted')).map(e => e.title))
      .toEqual(['Candidature reçue', 'En attente d’examen'])
  })
  it('confirmed app has the full happy path', () => {
    expect(timelineFor(app('enrolled')).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Oui'])
  })
})
```

Also test `p2Funnel` counts, `p1Filter('maybe')`, `nextDeadline`, `docsPill`/`formsPill` mappings, `overviewSubline` both phases — same table style.

- [ ] **Step 2: Run to verify fail** — `pnpm test lib/dashboard` → FAIL (module not found).

- [ ] **Step 3: Implement `lib/dashboard/rollup.ts`** exactly per the Interfaces + Exact mappings above. Keep it dependency-free and pure (only `Intl`). ~180 lines.

- [ ] **Step 4: Run to verify pass** — `pnpm test lib/dashboard` → PASS.

- [ ] **Step 5: Full gates + commit**

```bash
pnpm lint && npx tsc --noEmit
git add lib/dashboard
git commit -m "feat(dashboard): pure rollup/derivation library for funnel, pills, cards"
```

---

### Task 3: Bulk application actions

**Files:**
- Modify: `actions/applications.ts` (append)
- Test: `actions/__tests__/bulk-applications.test.ts` (create)

**Interfaces:**
- Consumes: existing `acceptApplication(id)`, `rejectApplication(id, note, sendEmail)` in the same file.
- Produces: `acceptApplications(ids: string[]): Promise<{ succeeded: number; failed: number }>` and `rejectApplications(ids: string[], note: string, sendEmail: boolean): Promise<{ succeeded: number; failed: number }>`.

- [ ] **Step 1: Write the failing test**

`actions/__tests__/bulk-applications.test.ts` — mock `@/lib/supabase/server` per the existing `actions/__tests__/applications.test.ts` style so that ownership assertion succeeds for id `'app-ok'` and fails (no row) for `'app-bad'`; mock `@/lib/email` send functions as no-op `vi.fn()`; mock `next/cache`. Assert:

```ts
it('accepts each id and reports partial failure', async () => {
  const res = await acceptApplications(['app-ok', 'app-bad'])
  expect(res).toEqual({ succeeded: 1, failed: 1 })
})
it('rejects each id with the shared note', async () => {
  const res = await rejectApplications(['app-ok'], 'note', false)
  expect(res).toEqual({ succeeded: 1, failed: 0 })
})
it('empty input is a no-op', async () => {
  expect(await acceptApplications([])).toEqual({ succeeded: 0, failed: 0 })
})
```

(Adapt the supabase stub from `applications.test.ts` — the accept path needs `applications` select→update and `exchanges` select for the email.)

- [ ] **Step 2: Run to verify fail** — `pnpm test bulk-applications` → FAIL.

- [ ] **Step 3: Implement** (append to `actions/applications.ts`):

```ts
// Bulk review from the Candidatures view. Loops the single-item actions so all
// side effects (invitation email, status guards, ownership assertion) stay in
// one place; per-id failures don't abort the batch.
export async function acceptApplications(ids: string[]): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0
  for (const id of ids) {
    try { await acceptApplication(id); succeeded++ } catch { failed++ }
  }
  revalidatePath('/applications')
  return { succeeded, failed }
}

export async function rejectApplications(ids: string[], note: string, sendEmail: boolean): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0
  for (const id of ids) {
    try { await rejectApplication(id, note, sendEmail); succeeded++ } catch { failed++ }
  }
  revalidatePath('/applications')
  return { succeeded, failed }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test bulk-applications applications` → PASS (existing suite too).

- [ ] **Step 5: Full gates + commit**

```bash
pnpm lint && npx tsc --noEmit
git add actions/applications.ts actions/__tests__/bulk-applications.test.ts
git commit -m "feat(applications): bulk accept/reject actions with partial-failure counts"
```

---

### Task 4: Shell updates — rail routes, phase pill, print, modal context

**Files:**
- Modify: `components/shell/OrganizerShell.tsx`
- Create: `components/shell/ShellUiContext.tsx`
- Modify: `app/(organizer)/layout.tsx`
- Modify: `app/globals.css` (print rules)
- Test: `components/shell/__tests__/OrganizerShell.test.tsx` (update)

**Interfaces:**
- Consumes: existing `OrganizerShell` props; `ExchangeOption` gains `phase`.
- Produces:
  - `ExchangeOption = { id: string; name: string; year: number; phase: 1 | 2 }` (layout select adds `phase`).
  - `ShellUiContext.tsx`:
    ```tsx
    'use client'
    import { createContext, useContext } from 'react'
    export const ShellUiContext = createContext<{ openNewExchange: () => void }>({ openNewExchange: () => {} })
    export const useShellUi = () => useContext(ShellUiContext)
    ```
    `OrganizerShell` wraps `{children}` in `<ShellUiContext.Provider value={{ openNewExchange: () => setNewExchangeOpen(true) }}>`.
  - Rail: Aperçu → `/dashboard` (unchanged); **Échanges → `/exchanges`, always rendered** (active when `pathname === '/exchanges'` or (`pathname.startsWith('/exchanges/')` and not `includes('/applications')`)); **Candid. → `/applications`** (active when `pathname.startsWith('/applications')`), rendered only when `active` non-null. Labels unchanged.
  - Top-bar pill: replace the year pill with the phase pill — text `Phase 1 · Recrutement` / `Phase 2 · Préparation` from `active.phase`, same classes (`rounded-pill bg-tint px-3 py-1 font-mono text-[11px] font-semibold text-tint-text`).
  - `data-noprint` attribute on the rail `<nav>` and the top-bar `<header>`.
- Print CSS appended to `app/globals.css`:
  ```css
  @media print {
    [data-noprint] { display: none !important; }
    body { background: #fff !important; }
    main { overflow: visible !important; }
  }
  ```

- [ ] **Step 1: Update the shell tests first (failing)**

In `components/shell/__tests__/OrganizerShell.test.tsx`: add `phase: 1 as const` to the `exchanges` fixture. Change/extend assertions:

```tsx
it('rail points at the session-scoped top-level routes', () => {
  render(<OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}><p>page</p></OrganizerShell>)
  expect(screen.getByRole('link', { name: /Échanges/ })).toHaveAttribute('href', '/exchanges')
  expect(screen.getByRole('link', { name: /Candid\./ })).toHaveAttribute('href', '/applications')
  expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()
})

it('Échanges stays visible with zero exchanges', () => {
  render(<OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" needsSchoolName={false}><p>page</p></OrganizerShell>)
  expect(screen.getByRole('link', { name: /Échanges/ })).toBeInTheDocument()
  expect(screen.queryByText('Candid.')).toBeNull()
})
```

(Keep the existing stale-cookie and dismissal tests; update any that assert the old `/exchanges/ex1` href or the year pill `2026`.)

- [ ] **Step 2: Run to verify fail** — `pnpm test OrganizerShell` → FAIL.

- [ ] **Step 3: Implement** the shell changes + context + print CSS per Interfaces. In `app/(organizer)/layout.tsx` change the exchanges select to `'id, name, year, phase'` and the `ExchangeOption[]` typing accordingly.

- [ ] **Step 4: Run to verify pass** — `pnpm test OrganizerShell` → PASS (all, including updated ones).

- [ ] **Step 5: Full gates + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add components/shell app/\(organizer\)/layout.tsx app/globals.css
git commit -m "feat(shell): session-scoped rail routes, phase pill, print rules, modal context"
```

---

### Task 5: Aperçu — `/dashboard` page + OverviewView + PhaseStepper

**Files:**
- Rewrite: `app/(organizer)/dashboard/page.tsx`
- Create: `components/dashboard/OverviewView.tsx`, `components/dashboard/PhaseStepper.tsx`
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: `listApplications(exchangeId)` (`actions/applications.ts`), `getExchangeGrid(exchangeId)` + `getExchanges()` (`actions/exchanges.ts`), everything from `lib/dashboard/rollup.ts` (Task 2), `setExchangePhase` (Task 1), `resolveActiveExchange`/`ACTIVE_EXCHANGE_COOKIE` (`lib/exchange-session.ts`), `useShellUi` (Task 4), `applicantName` (`lib/application-form.ts`).
- Produces:
  ```ts
  // components/dashboard/OverviewView.tsx ('use client')
  export type OverviewProps = {
    exchangeId: string
    phase: 1 | 2
    apps: AppRow[]                       // serialized from listApplications (pick id/status/submitted_at/data/email)
    rollups: DossierRollup[]
    templates: TemplateInfo[]
    cellMap: CellMap
  }
  export function OverviewView(props: OverviewProps): JSX.Element
  ```
  `PhaseStepper({ exchangeId, phase, progress }: { exchangeId: string; phase: 1 | 2; progress: { done: number; total: number; label: string } })`.
  OverviewView renders a drawer slot: it owns `const [selected, setSelected] = useState<AppRow | DossierRollup | null>(null)` and renders `<StudentDrawer …>` — **in this task render nothing for the drawer yet** (leave `{/* drawer: Task 6 */}` with the state wired to row clicks); Task 6 fills it.

**Page (server) — new `app/(organizer)/dashboard/page.tsx`:**

```tsx
import { cookies } from 'next/headers'
import { getExchanges, getExchangeGrid } from '@/actions/exchanges'
import { listApplications } from '@/actions/applications'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { rollupStudent, type AppRow } from '@/lib/dashboard/rollup'
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
  const rollups = grid.students.map((s: any) => rollupStudent(s, templates, grid.cellMap))

  return (
    <OverviewView exchangeId={active.id} phase={(active.phase ?? 1) as 1 | 2}
      apps={apps} rollups={rollups} templates={templates} cellMap={grid.cellMap} />
  )
}
```

`EmptyDashboard` (small client component in `components/dashboard/EmptyDashboard.tsx`): centered column with H3 `font-display text-2xl` « Aucun échange pour l'instant », body `text-muted-foreground` « Créez votre premier échange pour commencer. », primary button « + Nouvel échange » calling `useShellUi().openNewExchange()`. (The full designed 2e empty state lands in the system-states phase.)

**OverviewView layout (design values from the handoff Aperçu view — layout A):**

- Header: H1 `font-display text-[26px] font-bold tracking-tight` « Vue d'ensemble », subline `text-sm text-muted-foreground` = `overviewSubline(phase, apps, rollups)`, margin-bottom 22px.
- Two-column: `flex gap-6 items-start` — main `flex-1 min-w-0 flex flex-col gap-5`, right rail `w-[344px] flex-none flex flex-col gap-5` (stack under `xl:` breakpoint: `flex-col xl:flex-row`).
- **Funnel card** (`bg-card border rounded-[14px] p-[18px] px-5`): header row — mono label `font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary` « Progression des candidatures » (P1) / « Progression des dossiers » (P2) + when a filter is active a dismissible chip `border bg-hint rounded-pill px-[11px] py-1 text-[11px] font-medium text-muted-foreground` « Filtre : {label} ✕ » (click clears). Stage tiles: `flex flex-wrap gap-2.5`, each a button `flex flex-col items-start gap-1 rounded-[10px] border px-3.5 py-2.5 min-w-[96px]` — active filter: `border-brand bg-tint/40`; count `font-display text-[22px] font-bold leading-none` (active → `text-brand`, else `text-navy`), label `text-[11.5px] text-muted-foreground`. Clicking toggles that stage as the table filter (`all` clears).
- **Table card** (`bg-card border rounded-[14px] overflow-hidden`): header row `grid` with mono uppercase 10px headers (`font-mono text-[10px] uppercase tracking-[.08em] text-tertiary bg-[#FBFCFE] border-b px-5 py-2.5`). Grid columns P1 `1.7fr 1fr 1.15fr 1fr 22px` (Élève / Candidature / Statut / Réponse / ›), P2 `1.7fr 1fr 1.1fr .9fr 1fr 22px` (Élève / Formulaires / Documents / Échéance / Statut / ›). Rows: `grid px-5 py-3 text-sm border-b last:border-0 hover:bg-hoverrow-soft cursor-pointer` — P1 cells: `applicantName(app.data) || app.email` (name `font-medium text-navy`), `frShortDate(submitted_at)` plain `text-muted-foreground text-[13px]`, `p1StatusPill`, `p1ResponsePill` (null → `—` plain), chevron `›` `text-placeholder`. P2 cells: name, `formsPill`, `docsPill`, `frShortDate(due)`, `overall` pill. Row click sets `selected`. Empty filtered table: centered `text-sm text-muted-foreground py-8` « Aucun élève ne correspond à ce filtre. »
- **Right rail**: PhaseStepper card, then « À faire maintenant » card, then reminder card.
  - `PhaseStepper` card (`bg-card border rounded-[14px] p-[18px]`): mono label « Progression de l'échange »; progress: track `h-[10px] rounded-pill bg-track` + fill `bg-brand rounded-pill` width `%`, label `text-[12.5px] text-muted-foreground mt-1.5` from `progress().label`; then the two steps (rows `flex items-start gap-3 py-2.5 cursor-pointer`): numbered square 30px `rounded-[9px] flex items-center justify-center text-xs font-semibold` — active: `bg-brand text-white`; done (step 1 when phase 2): `bg-rail text-white`; todo: `bg-background text-tertiary`; title `text-sm font-semibold` (« Recrutement & sélection », « Préparation des dossiers ») + mono kicker `font-mono text-[10px] uppercase text-tertiary` (« Phase 1 », « Phase 2 »). Clicking a step calls `setExchangePhase(exchangeId, n)` then `router.refresh()`; disable while pending; on error render `text-sm text-danger-text` below.
  - Action cards: mono label « À faire maintenant »; if `actionCards(...)` empty → `text-sm text-muted-foreground` « Tout est à jour ✓{next ? ` — prochaine échéance le ${frShortDate(next)}.` : '' } » (next = `nextDeadline(rollups)`). Cards: `bg-card border rounded-[12px] p-[17px] pl-[19px] flex flex-col gap-1.5 border-l-[3px]` with left bar `border-l-brand` (accent) / `border-l-[#B7791F]` (warn) / `border-l-[#C0392B]` (bad); title `text-sm font-semibold text-navy`, desc `text-[12.5px] text-muted-foreground`, CTA button `self-start rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold` — accent `bg-brand text-white`, warn `bg-warn text-warn-text`, bad `bg-danger text-danger-text`; clicking sets the table filter to `filterKey`.
  - Reminder card (`bg-card border rounded-[14px] p-[15px] flex gap-2.5 items-start`): `↻` `text-brand` + `text-[12.5px] text-muted-foreground` = `reminderLine(...)`.

- [ ] **Step 1: Write failing tests** `components/dashboard/__tests__/OverviewView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/actions/exchanges', () => ({ setExchangePhase: vi.fn() }))
vi.mock('@/actions/applications', () => ({ acceptApplication: vi.fn(), rejectApplication: vi.fn() }))

import { OverviewView } from '@/components/dashboard/OverviewView'
import type { AppRow } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
]
const base = { exchangeId: 'ex1', apps, rollups: [], templates: [], cellMap: {} }

describe('OverviewView phase 1', () => {
  it('renders heading, funnel counts and table rows', () => {
    render(<OverviewView {...base} phase={1} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.getByText('Reçues')).toBeInTheDocument()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    expect(screen.getByText('Confirmé')).toBeInTheDocument()
  })
  it('funnel tile filters the table and shows a dismissible chip', () => {
    render(<OverviewView {...base} phase={1} />)
    fireEvent.click(screen.getByRole('button', { name: /À examiner/ }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Filtre :/ }))
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })
  it('action card click applies its filter', () => {
    render(<OverviewView {...base} phase={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Examiner' }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
  })
})

describe('OverviewView phase 2', () => {
  it('renders dossier columns from rollups', () => {
    render(<OverviewView {...base} phase={2} rollups={[{ studentId: 's1', name: 'Manon Girard', forms: 'pending', docs: 'missing', due: '2026-10-03', late: true, overall: { kind: 'bad', label: 'En retard' } }]} />)
    expect(screen.getByText('Formulaires')).toBeInTheDocument()
    expect(screen.getByText('Manon Girard')).toBeInTheDocument()
    expect(screen.getByText('En retard')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail** — `pnpm test OverviewView` → FAIL.
- [ ] **Step 3: Implement** `PhaseStepper.tsx`, `EmptyDashboard.tsx`, `OverviewView.tsx`, and the page per the layout spec above.
- [ ] **Step 4: Run to verify pass** — `pnpm test OverviewView` → PASS.
- [ ] **Step 5: Check the old dashboard tests** — `pnpm test` full run; the previous dashboard page had no dedicated test, but fix any suite referencing removed markup.
- [ ] **Step 6: Full gates + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add app/\(organizer\)/dashboard components/dashboard
git commit -m "feat(dashboard): Aperçu view — funnel, phase-aware table, stepper, action cards"
```

---

### Task 6: StudentDrawer

**Files:**
- Create: `components/dashboard/StudentDrawer.tsx`
- Modify: `components/dashboard/OverviewView.tsx` (render the drawer)
- Test: `components/dashboard/__tests__/StudentDrawer.test.tsx`

**Interfaces:**
- Consumes: `timelineFor`, `frShortDate`, pills from `lib/dashboard/rollup.ts`; `acceptApplication`, `rejectApplication` from `actions/applications.ts`; `applicantName` from `lib/application-form.ts`.
- Produces:
  ```tsx
  export type DrawerSubject =
    | { kind: 'application'; app: AppRow }
    | { kind: 'student'; rollup: DossierRollup; items: { label: string; group: 'form' | 'doc'; pill: Pill }[] }
  export function StudentDrawer({ subject, onClose }: { subject: DrawerSubject | null; onClose: () => void }): JSX.Element | null
  ```
  OverviewView builds the subject on row click: P1 row → `{ kind: 'application', app }`; P2 row → `{ kind: 'student', rollup, items }` where `items` maps the student's templates through `cellMap` (label = template name, group = 'form'|'doc' by type, pill: approved → ok «Fourni» (form: ok «Reçu»), submitted → info «À vérifier», draft → warn «En cours», none → bad «Manquant»). Build the items in OverviewView (it holds templates + cellMap) and pass them in.

**Design values:** fixed overlay `fixed inset-0 z-40` with backdrop `bg-rail/30` (click closes; Escape closes) + panel `absolute right-0 top-0 h-full w-[420px] bg-card shadow-modal p-7 overflow-auto` (entry animation: `animate-[drwIn_.25s_ease-out]`; add `@keyframes drwIn { from { transform: translateX(30px); opacity: 0 } to { transform: none; opacity: 1 } }` to `app/globals.css`).
- Header: 44px circle `bg-tint text-tint-text font-mono text-[13px] font-semibold` initials (first letters of first two name words) + name `font-display text-lg font-bold` + status pill (`p1StatusPill(app.status)` or `rollup.overall`) + ✕ button `ml-auto text-placeholder hover:text-navy` (onClose).
- Application subject: mono section label « Parcours » (`font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary mt-6 mb-3`), timeline from `timelineFor(app)` — rows `flex gap-3`: dot 10px `rounded-full mt-1` colored by kind (ok `bg-success-text`, warn `bg-warn-text`, bad `bg-danger-text`, neutral `bg-placeholder`, info `bg-brand`) with a 2px `bg-border` connector line between rows; title `text-sm font-medium text-navy`, sub `text-[12.5px] text-muted-foreground`. Footer (only when `app.status === 'submitted'`): `flex gap-2.5 mt-7` — « Accepter & inviter » `flex-1 rounded-[9px] bg-brand text-white py-[11px] text-[13px] font-semibold hover:bg-brand-hover` calling `acceptApplication(app.id)` then `router.refresh()` + onClose; « Refuser » `flex-1 rounded-[9px] border border-frame-dashed bg-card text-navy` — first click reveals an inline note field (`textarea` placeholder « Note pour l'élève (facultatif) », 60px) + checkbox « Prévenir par e-mail » (default checked) + confirm button « Confirmer le refus » `bg-danger text-danger-text` calling `rejectApplication(app.id, note, sendEmail)` then refresh + close. Busy labels « Envoi… » disable both.
- Student subject: mono label `Formulaires & documents · échéance ${frShortDate(rollup.due)}` (omit the « · échéance … » part when `due` null); checklist rows `flex items-center justify-between py-2 border-b last:border-0` — label `text-sm text-navy`, pill right. Below: reminder note `flex gap-2 items-start mt-4 text-[12.5px] text-muted-foreground` with `↻ text-brand` — text « Relances automatiques quotidiennes en période d'échéance. » (static informational line). No footer actions.
- Errors from actions render as `text-sm text-danger-text` above the footer.

- [ ] **Step 1: Write failing tests** `components/dashboard/__tests__/StudentDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const accept = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/applications', () => ({
  acceptApplication: (...a: unknown[]) => accept(...a),
  rejectApplication: vi.fn().mockResolvedValue(undefined),
}))

import { StudentDrawer } from '@/components/dashboard/StudentDrawer'

const app = { id: 'a1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' }

describe('StudentDrawer', () => {
  it('renders nothing when subject is null', () => {
    const { container } = render(<StudentDrawer subject={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
  it('application subject: timeline + accept action', async () => {
    render(<StudentDrawer subject={{ kind: 'application', app }} onClose={() => {}} />)
    expect(screen.getByText('Parcours')).toBeInTheDocument()
    expect(screen.getByText('Candidature reçue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(accept).toHaveBeenCalledWith('a1')
  })
  it('reject requires the inline confirm step', () => {
    render(<StudentDrawer subject={{ kind: 'application', app }} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(screen.getByRole('button', { name: 'Confirmer le refus' })).toBeInTheDocument()
  })
  it('student subject: checklist without actions', () => {
    render(<StudentDrawer subject={{ kind: 'student', rollup: { studentId: 's1', name: 'Manon Girard', forms: 'pending', docs: 'missing', due: '2026-10-03', late: true, overall: { kind: 'bad', label: 'En retard' } }, items: [{ label: 'Passeport', group: 'doc', pill: { kind: 'bad', label: 'Manquant' } }] }} onClose={() => {}} />)
    expect(screen.getByText('Passeport')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accepter & inviter' })).toBeNull()
  })
  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    render(<StudentDrawer subject={{ kind: 'application', app }} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify fail** — `pnpm test StudentDrawer` → FAIL.
- [ ] **Step 3: Implement** the drawer + wire into OverviewView (row click opens; add `data-testid="drawer-backdrop"` to the backdrop; Escape listener like the shell menus).
- [ ] **Step 4: Run to verify pass** — `pnpm test StudentDrawer OverviewView` → PASS.
- [ ] **Step 5: Full gates + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add components/dashboard app/globals.css
git commit -m "feat(dashboard): student drawer — timeline, dossier checklist, review actions"
```

---

### Task 7: Échanges — `/exchanges` page + ExchangesView

**Files:**
- Create: `app/(organizer)/exchanges/page.tsx`
- Create: `components/exchanges/ExchangesView.tsx`
- Test: `components/exchanges/__tests__/ExchangesView.test.tsx`

**Interfaces:**
- Consumes: `getExchanges`, `getExchangeGrid`, `listApplications`; `rollupStudent`, `progress` from rollup lib; `hasActivePlan`, `isInGrace`, `exchangeCap`, `PLAN_EXCHANGE_CAP` (`lib/billing/limits.ts`); `PLAN_KEYS` (`lib/billing/plans.ts`); `useShellUi` (Task 4).
- Produces:
  ```tsx
  export type ExchangeCardData = { id: string; name: string; year: number; phase: 1 | 2; pct: number | null; pctLabel: string }
  export type BillingBlock =
    | { kind: 'trial' }
    | { kind: 'active'; planLabel: string }
    | { kind: 'grace' }
  export function ExchangesView({ billing, exchangesData, atCap }: { billing: BillingBlock; exchangesData: ExchangeCardData[]; atCap: boolean }): JSX.Element
  ```

**Page (server):** fetch `getExchanges()`; profile school billing row (same query as `app/(organizer)/layout.tsx` uses — `schools(name, subscription_status, plan, grace_until)`); for each exchange compute progress: `listApplications` + `getExchangeGrid` per exchange **in parallel** (`Promise.all` over exchanges); `pct` = phase 1 → `progress(1, apps, [])` / phase 2 → `progress(2, [], rollups)`, `pct = total === 0 ? null : Math.round(done / total * 100)`, `pctLabel` = the progress label (or `'—'` when null). `billing`: `hasActivePlan` → `{ kind: 'active', planLabel }` (Starter/Growth/Scale from the plan key, capitalize via map `{ starter: 'Starter', growth: 'Growth', scale: 'Scale' }`); `isInGrace` → `{ kind: 'grace' }`; else `{ kind: 'trial' }`. `atCap` = owned-exchange count ≥ `exchangeCap(school)` (owned = `school_a_id === profile.school_id`, same as the old dashboard page logic).

**ExchangesView layout (handoff Échanges view):**
- H1 « Échanges » `font-display text-[26px] font-bold tracking-tight` + subline « Suivez tous vos programmes d'échange — passés, en cours et à venir. »
- Billing block:
  - `trial`: banner card `bg-card border rounded-[14px] p-5 flex gap-3 items-start` — ★ in a 34px `rounded-[9px] bg-tint text-tint-text` square; title `text-sm font-semibold text-navy` « Essai gratuit — votre premier échange est offert »; body `text-[13px] text-muted-foreground` « Choisissez un forfait pour créer d'autres échanges et débloquer toutes vos sessions. »; right mono link `font-mono text-[11px] text-tertiary` « Forfaits ci-dessous ↓ ». Below: 3 plan tiles `grid grid-cols-1 sm:grid-cols-3 gap-3.5` — tile `border rounded-[14px] p-5 flex flex-col gap-2` (Growth: `border-2 border-brand bg-hoverrow relative` + floating mono pill « POPULAIRE » `absolute -top-2.5 left-4 rounded-pill bg-brand text-white px-2.5 py-0.5 font-mono text-[10px] font-semibold`); name `font-display text-[17px] font-bold`; price row `text-navy font-semibold text-lg` $299|$499|$599 + `text-muted-foreground text-[12.5px]` « / an »; cap `text-[13.5px] text-muted-foreground` « 2 échanges » / « 6 échanges » / « Échanges illimités »; CTA `<Link href={`/billing/checkout?plan=${key}`}>` « Choisir {Name} » `rounded-[9px] bg-brand text-white text-center py-2.5 text-[13px] font-semibold hover:bg-brand-hover` (Starter/Scale: secondary style `border bg-card text-navy hover:bg-hint`).
  - `active`: card `bg-card border rounded-[14px] p-5 flex items-center justify-between` — « Forfait {planLabel} » `text-sm font-semibold text-navy` + `<Link href="/billing/portal">` « Gérer l'abonnement » `rounded-[9px] border px-4 py-2 text-[13px] font-semibold text-navy hover:bg-hint`.
  - `grace`: same as `active` layout but title « Paiement en échec — accès maintenu temporairement » in `text-danger-text` and the link labeled « Mettre à jour le paiement » → `/billing/portal`.
- « Vos échanges » section: header row — mono label `font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary` « Vos échanges » + button « + Nouvel échange » `rounded-[9px] bg-brand text-white px-4 h-[38px] text-[13px] font-semibold` calling `useShellUi().openNewExchange()` (when `atCap`, replace with `<Link href="/billing">` « Choisir un forfait » secondary style + line `text-[12.5px] text-muted-foreground` « Créez d'autres échanges en choisissant un forfait. »).
- Exchange cards list `flex flex-col gap-3`: each `<Link href={`/exchanges/${id}`}>` card `bg-card border rounded-[14px] p-5 hover:bg-hoverrow-soft` — row: name `font-display text-base font-bold text-navy` + year badge `rounded-pill bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground` + phase tag pill `rounded-pill bg-tint text-tint-text px-2.5 py-0.5 font-mono text-[11px]` (« Phase 1 · Recrutement » / « Phase 2 · Préparation »); second row `text-[13px] text-muted-foreground` `pctLabel`; progress bar (when `pct !== null`): track `h-[8px] rounded-pill bg-track mt-2.5` + `bg-brand` fill at `pct%` + `text-[12px] text-muted-foreground mt-1` `{pct}%`.
- Zero exchanges: the « Vos échanges » list renders `text-sm text-muted-foreground py-6` « Aucun échange pour l'instant — créez le premier. » (button above still shows).

- [ ] **Step 1: Write failing tests** `components/exchanges/__tests__/ExchangesView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { ExchangesView } from '@/components/exchanges/ExchangesView'

const ex = { id: 'e1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, pct: 40, pctLabel: '2 / 5 candidatures traitées' }

describe('ExchangesView', () => {
  it('trial state shows the banner and the three plans', () => {
    render(<ExchangesView billing={{ kind: 'trial' }} exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText(/Essai gratuit — votre premier échange est offert/)).toBeInTheDocument()
    expect(screen.getByText('Starter')).toBeInTheDocument()
    expect(screen.getByText('POPULAIRE')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choisir Growth' })).toHaveAttribute('href', '/billing/checkout?plan=growth')
  })
  it('active plan state shows the manage link instead of tiles', () => {
    render(<ExchangesView billing={{ kind: 'active', planLabel: 'Growth' }} exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('Forfait Growth')).toBeInTheDocument()
    expect(screen.queryByText('POPULAIRE')).toBeNull()
  })
  it('exchange card shows name, phase tag and progress', () => {
    render(<ExchangesView billing={{ kind: 'trial' }} exchangesData={[ex]} atCap={false} />)
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('at cap swaps the create button for the plan CTA', () => {
    render(<ExchangesView billing={{ kind: 'trial' }} exchangesData={[ex]} atCap />)
    expect(screen.queryByRole('button', { name: /Nouvel échange/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Choisir un forfait' })).toHaveAttribute('href', '/billing')
  })
})
```

- [ ] **Step 2: Run to verify fail** — `pnpm test ExchangesView` → FAIL.
- [ ] **Step 3: Implement** the view + page per spec.
- [ ] **Step 4: Run to verify pass**, then **Step 5: full gates + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add app/\(organizer\)/exchanges/page.tsx components/exchanges
git commit -m "feat(exchanges): Échanges view — billing block, exchange cards with progress"
```

---

### Task 8: Candidatures — `/applications` page, view, detail, redirects

**Files:**
- Create: `app/(organizer)/applications/page.tsx`
- Create: `components/applications/CandidaturesView.tsx`, `components/applications/ApplicationDetail.tsx`
- Modify: `components/ApplicationReadView.tsx` (add `lang` prop)
- Rewrite as redirects: `app/(organizer)/exchanges/[id]/applications/page.tsx`, `app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx`
- Test: `components/applications/__tests__/CandidaturesView.test.tsx`

**Interfaces:**
- Consumes: `listApplications`, `getApplicationForReview`, `acceptApplication`, `rejectApplication`, `acceptApplications`, `rejectApplications` (Task 3); rollup lib pills + `frShortDate`; `applicantName`; `resolveActiveExchange`; `APPLICATION_SECTIONS`.
- Produces:
  ```tsx
  export function CandidaturesView({ apps, exchangeName }: { apps: AppRow[]; exchangeName: string }): JSX.Element
  export function ApplicationDetail({ application, photoUrl, exchangeName, year }: { application: any; photoUrl: string | null; exchangeName: string; year: number }): JSX.Element
  ```
- `ApplicationReadView` gains `lang?: 'en' | 'fr'` (default `'en'`) and renders `section.title[lang]` / `f.label[lang]` — existing English call sites unaffected.

**Page (server) `app/(organizer)/applications/page.tsx`:**

```tsx
import { cookies } from 'next/headers'
import { getExchanges } from '@/actions/exchanges'
import { listApplications, getApplicationForReview } from '@/actions/applications'
import { resolveActiveExchange, ACTIVE_EXCHANGE_COOKIE } from '@/lib/exchange-session'
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import { ApplicationDetail } from '@/components/applications/ApplicationDetail'
import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'
import type { AppRow } from '@/lib/dashboard/rollup'

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  const exchanges = await getExchanges()
  const cookieStore = await cookies()
  const active = resolveActiveExchange(exchanges, cookieStore.get(ACTIVE_EXCHANGE_COOKIE)?.value)
  if (!active) return <EmptyDashboard />

  if (id) {
    const { application, photoUrl } = await getApplicationForReview(id)
    return <ApplicationDetail application={application} photoUrl={photoUrl} exchangeName={active.name} year={active.year} />
  }

  const applications = await listApplications(active.id)
  const apps: AppRow[] = applications.map((a: any) => ({
    id: a.id, status: a.status, submitted_at: a.submitted_at, data: a.data ?? {}, email: a.email,
  }))
  return <CandidaturesView apps={apps} exchangeName={active.name} />
}
```

**CandidaturesView (client) design:**
- H1 « Candidatures » + subline `text-sm text-muted-foreground` `${apps.length} candidature(s) reçue(s) pour ${exchangeName}.` (pluralize with the same `p()` rule; zero → « Aucune candidature reçue pour le moment — partagez le lien de candidature depuis la page de l'échange. »).
- Segmented tabs `flex gap-1.5 bg-subtle rounded-[11px] p-1 w-fit mb-4`: « Toutes » / « À examiner » / « Acceptées » / « Refusées » — each `rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium flex gap-1.5 items-center` (active: `bg-card text-navy shadow-sm font-semibold`, inactive `text-muted-foreground`), count `font-mono text-[11px] text-tertiary`. Predicates: Toutes = all; À examiner = `submitted`; Acceptées = `accepted|maybe|enrolling|enrolled`; Refusées = `rejected|declined`.
- Bulk bar (visible when ≥1 selected): `flex items-center gap-2.5 bg-tint border border-tint-border rounded-[11px] px-4 py-2.5 mb-3` — `text-[13px] font-semibold text-tint-text` `{n} sélectionnée{p(n)}`; buttons « Accepter & inviter » (`bg-brand text-white rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold`), « Refuser » (`bg-danger text-danger-text` same shape; opens the same inline note+email confirm pattern as the drawer, applied to the whole selection via `rejectApplications`), « Annuler » ghost `text-muted-foreground` (clears selection). After a bulk call: clear selection, `router.refresh()`, and if `failed > 0` show `text-sm text-danger-text` « {succeeded} traitée{p} · {failed} en échec ». Buttons busy-disable with « Envoi… ».
- Table (`bg-card border rounded-[14px] overflow-hidden`): header grid `28px 1.7fr 1fr 1fr .9fr 1.1fr 22px` mono 10px uppercase — ✓(checkbox select-all) / Élève / Niveau 26-27 / Langue mat. / Reçue le / Statut / ›. Rows: checkbox (stops propagation), name (`applicantName(a.data) || a.email`), `a.data.grade ?? '—'`, `a.data.native_language ?? '—'`, `frShortDate(a.submitted_at)`, `p1StatusPill(a.status)`, `›`. Row click (not checkbox) → `router.push(`/applications?id=${a.id}`)`.
- Filtered-empty: « Aucune candidature dans cet onglet. »

**ApplicationDetail (server-renderable) design:**
- Top row (`data-noprint`): `<Link href="/applications">` « ‹ Retour aux candidatures » `text-sm text-muted-foreground hover:text-navy` + `<PrintButton />` (tiny client component: button « ⎙ Imprimer la candidature » same style, `onClick={() => window.print()}`).
- Header: name `font-display text-2xl font-bold` (from `applicantName(application.data)`), status pill (`p1StatusPill`), line `font-mono text-[12px] text-tertiary uppercase tracking-[.08em]` `Candidature · ${exchangeName} · ${year}`.
- Body: white card `bg-card border rounded-card p-8` wrapping `<ApplicationReadView data={application.data} photoUrl={photoUrl} lang="fr" />` restyled: in `ApplicationReadView`, section headings become `font-display text-[17px] font-bold tracking-tight border-b pb-2 mb-4` and keep the dl grid.
- Footer (`data-noprint`, only when `application.status === 'submitted'`): reuse the existing `ApplicationReviewActions` component (`components/ApplicationReviewActions.tsx`) as-is — check its props signature before wiring (it powered the old detail page; pass the same props the old `[applicationId]/page.tsx` passed it). If its copy is English, leave it (page copy migrates per phase; the component is shared).

**Redirect stubs:**

```tsx
// app/(organizer)/exchanges/[id]/applications/page.tsx
import { redirect } from 'next/navigation'
export default function LegacyApplicationsPage() { redirect('/applications') }
```

```tsx
// app/(organizer)/exchanges/[id]/applications/[applicationId]/page.tsx
import { redirect } from 'next/navigation'
export default async function LegacyApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params
  redirect(`/applications?id=${applicationId}`)
}
```

Delete everything else in those two files. Search for links to the legacy routes and update them: `grep -rn "applications" app components --include="*.tsx" | grep "exchanges/"` — notably `components/ApplicationsCard.tsx` (links to `/exchanges/[id]/applications`) → point its list link at `/applications`; `ApplicationReviewActions`' `revalidatePath`/redirect targets can stay (server-side revalidation of a redirecting route is harmless), but if it `router.push`es back to the legacy list, change that push to `/applications`.

- [ ] **Step 1: Write failing tests** `components/applications/__tests__/CandidaturesView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const bulkAccept = vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 })
vi.mock('@/actions/applications', () => ({
  acceptApplications: (...a: unknown[]) => bulkAccept(...a),
  rejectApplications: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))
import { CandidaturesView } from '@/components/applications/CandidaturesView'

const apps = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', data: {}, email: 'r@r.fr' },
]

describe('CandidaturesView', () => {
  it('tabs filter with counts', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
  it('selection reveals the bulk bar and accepts the selection', async () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1]) // first row
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    expect(screen.getByText('2 sélectionnées')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(bulkAccept).toHaveBeenCalledWith(['1', '2'])
  })
  it('row click navigates to the detail', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })
  it('select-all checkbox selects the filtered rows', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('3 sélectionnées')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail** — `pnpm test CandidaturesView` → FAIL.
- [ ] **Step 3: Implement** view + detail + `ApplicationReadView` lang prop + page + redirect stubs + legacy-link sweep.
- [ ] **Step 4: Run to verify pass** — `pnpm test CandidaturesView` and the full suite (legacy page tests, if any, must be updated to expect redirects).
- [ ] **Step 5: Full gates + commit**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
git add -A app/\(organizer\) components/applications components/ApplicationReadView.tsx components/ApplicationsCard.tsx
git commit -m "feat(applications): Candidatures view with bulk review + detail; legacy routes redirect"
```

---

### Task 9: Finish — migration push, live verification, merge gate

- [ ] **Step 1: Full verification** — `pnpm lint && pnpm test && npx tsc --noEmit`, all green.
- [ ] **Step 2: Apply the migration** to the Supabase project with the user aware: `supabase db push` (if it hangs at "Initialising login role", use the IPv4 session pooler `--db-url` per repo memory). Verify: `select column_name from information_schema.columns where table_name='exchanges' and column_name='phase';` via MCP `execute_sql`.
- [ ] **Step 3: Live drive** (controller): dev server + headless organizer session (magic-link method from Phase 1): `/dashboard` funnel + filter + drawer; stepper switches phase (and top-bar pill follows); `/exchanges` shows billing block + cards; `/applications` tabs/bulk-bar/detail; legacy URLs redirect; print view of a detail page hides the shell.
- [ ] **Step 4:** superpowers:finishing-a-development-branch — merge to `main` only with explicit user confirmation (production deploy).

---

## Self-review notes (applied)

- Spec coverage: routes/rail/redirects (T4, T8), migration + stepper (T1, T5), status mappings + funnels + cards + progress + dates (T2), bulk (T3, T8), drawer (T6), Échanges billing/cards (T7), detail + print (T4 print CSS, T8), French copy verbatim (embedded per task), error handling (partial-failure copy T8, stepper revert T5, drawer errors T6), zero-exchange states (T5 EmptyDashboard, T7 list empty, T8 EmptyDashboard).
- Deliberately out (per spec): shortlist status, manual Relancer, Marquer confirmé, layout B, search.
- Type consistency: `AppRow`/`DossierRollup`/`TemplateInfo`/`CellMap`/`Pill` defined once in T2 and imported everywhere; `ExchangeOption.phase` added in T4 and consumed in T5/T7 pages via `getExchanges()` rows (the select in `getExchanges` uses `*` so `phase` flows through automatically); `p()` pluralization lives in rollup.ts (export it) — T7/T8 import it rather than redefining.
- Known judgment call: `ApplicationReviewActions` is reused as-is in the detail footer (English copy acceptable until its phase); the reviewer should not expect a restyle beyond placement.
