# Overview Usability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four organizer-Overview usability fixes — a second empty-state CTA to `/forms`, enrolled-student name fallback, « Confirmed » → « Accepted » everywhere (incl. funnel semantics), applicant rows navigating to the application page instead of a drawer — plus deletion of the now-dead drawer application branch.

**Architecture:** UI-only change. All logic edits live in the pure derivation library `lib/dashboard/rollup.ts` (vitest-covered, French assertions via a real `fr` translator); UI edits in `components/dashboard/OverviewView.tsx` and `components/dashboard/StudentDrawer.tsx`; copy edits in the 5 locale catalogs `messages/{en,fr,es,it,de}.json`. No migration, no new server actions, no RLS impact.

**Tech Stack:** Next.js 14 App Router, next-intl v4 (typed root translator — unknown keys fail `npx tsc --noEmit`), vitest + @testing-library/react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-16-overview-usability-design.md`

## Global Constraints

- **All 5 locales change together** (en/fr/es/it/de). `messages/__tests__/parity.test.ts` fails if any locale's key structure or ICU args drift — every message task edits all 5 files in the same commit.
- **Message key renames ride with their consumers.** The typed translator makes `t('organizer.dashboard.pills.confirmed')` a compile error once the key is gone — rename key + call site in the same commit or `npx tsc --noEmit` breaks.
- **Preserve accents exactly** in fr/es/it/de strings (é, è, ê, «, », ’, ß, ü…). If you are a subagent on a model that strips accents, stop and report instead of writing mangled French.
- **Gate per task:** `pnpm test` (vitest) + `npx tsc --noEmit`. **Final gate:** `pnpm lint` · `pnpm test` · `npx tsc --noEmit`. (`pnpm build` fails locally on placeholder `.env.local` values — CI runs the real build. Do not chase local build failures caused by env placeholders.)
- No migration → `pnpm test:rls` **not** required.
- **Branch:** all work on `feature/overview-usability` (created in Task 1). Verify `git branch --show-current` before **every** commit — concurrent sessions have moved HEAD before. Stage only the files named in each task (never `git add -A`).
- **DB statuses unchanged:** `accepted`/`enrolling`/`enrolled` stay as-is. This is label + navigation work only.
- Heads-up (do not act on it): a git worktree at `.claude/worktrees/invite-inline-continuation` also touches `rollup.ts`/`OverviewView.tsx` on another branch. Whichever merges second rebases; not this plan's problem.

---

### Task 1: Enrolled-student name fallback in `buildLifecycleRows`

When a student replies yes to an invitation, `actions/invitations.ts` creates their profile with `full_name: ''` (empty until they finish `/accept-invite`). The Overview row and drawer header render blank. Fix: fall back to the matching application's applicant name (same normalized-email match the merge already performs), else the student's email.

**Files:**
- Modify: `lib/dashboard/rollup.ts` (the `enrolledRows` block inside `buildLifecycleRows`, currently lines 243–247)
- Test: `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: existing `applicantName(data)` (already imported at the top of `rollup.ts` from `@/lib/application-form` — returns `''` when no name parts), existing `normEmail`, existing `CONFIRMED_STATUSES = ['enrolling', 'enrolled']`.
- Produces: `buildLifecycleRows` unchanged signature; enrolled rows now guarantee non-empty `name`, and `row.rollup.name` carries the same resolved name (a copied rollup — `StudentDrawer` reads `rollup.name` and must show the resolved name without changes).

- [ ] **Step 0: Create the branch**

```bash
git checkout main && git pull --ff-only && git checkout -b feature/overview-usability
```

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('buildLifecycleRows', …)` block of `lib/dashboard/__tests__/rollup.test.ts`:

```ts
  it('enrolled row with empty full_name falls back to the matching application name (row AND rollup copy)', () => {
    const blankStudents: EnrolledStudent[] = [{ id: 's1', full_name: '', email: 'c@l.fr' }]
    const blankRollup = rollupStudent({ id: 's1', full_name: '' }, T, cell('approved', 'approved'), TODAY, t)
    const apps = [app('enrolled', { id: 'a1', email: ' C@L.FR ', data: { first_name: 'Camille', last_name: 'Laurent' } })]
    const rows = buildLifecycleRows(apps, blankStudents, [blankRollup], t)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Camille Laurent')
    // the drawer reads rollup.name — the copy carried by the row must be resolved too
    expect(rows[0].kind === 'enrolled' && rows[0].rollup.name).toBe('Camille Laurent')
  })
  it('enrolled row with empty full_name and no matching application falls back to email', () => {
    const blankStudents: EnrolledStudent[] = [{ id: 's1', full_name: '', email: 'c@l.fr' }]
    const blankRollup = rollupStudent({ id: 's1', full_name: '' }, T, cell('approved', 'approved'), TODAY, t)
    const rows = buildLifecycleRows([], blankStudents, [blankRollup], t)
    expect(rows[0].name).toBe('c@l.fr')
  })
  it('matching application without name data falls back to email', () => {
    const blankStudents: EnrolledStudent[] = [{ id: 's1', full_name: '', email: 'c@l.fr' }]
    const blankRollup = rollupStudent({ id: 's1', full_name: '' }, T, cell('approved', 'approved'), TODAY, t)
    const apps = [app('enrolling', { id: 'a1', email: 'c@l.fr', data: {} })]
    expect(buildLifecycleRows(apps, blankStudents, [blankRollup], t)[0].name).toBe('c@l.fr')
  })
  it('whitespace-only full_name is treated as empty', () => {
    const blankStudents: EnrolledStudent[] = [{ id: 's1', full_name: '  ', email: 'c@l.fr' }]
    const blankRollup = rollupStudent({ id: 's1', full_name: '  ' }, T, cell('approved', 'approved'), TODAY, t)
    expect(buildLifecycleRows([], blankStudents, [blankRollup], t)[0].name).toBe('c@l.fr')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/dashboard/__tests__/rollup.test.ts`
Expected: 4 new tests FAIL (`expected '' to be 'Camille Laurent'` / `to be 'c@l.fr'`); all pre-existing tests PASS.

- [ ] **Step 3: Implement the fallback**

In `lib/dashboard/rollup.ts`, replace the `enrolledRows` block inside `buildLifecycleRows`:

```ts
  const enrolledRows: LifecycleRow[] = students.flatMap(s => {
    const rollup = rollupByStudent.get(s.id)
    if (!rollup) return []
    // A student who replied yes but hasn't finished account setup has an empty
    // profile full_name. Reuse the merge's email match to borrow the applicant
    // name from their confirmed application, else show the email. The row's
    // rollup copy carries the resolved name so the drawer header shows it too.
    let name = rollup.name.trim()
    if (!name) {
      const match = apps.find(a => CONFIRMED_STATUSES.includes(a.status) && normEmail(a.email) === normEmail(s.email))
      name = (match ? applicantName(match.data) : '') || s.email
    }
    const resolved = name === rollup.name ? rollup : { ...rollup, name }
    return [{ kind: 'enrolled' as const, key: `stu:${s.id}`, name, candidature: candidaturePill(null, t), rollup: resolved }]
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/dashboard/__tests__/rollup.test.ts` → all PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts
git commit -m "fix(dashboard): enrolled rows fall back to application name, then email"
```

---

### Task 2: « Accepted » replaces « Confirmed » — pills, funnel tile, filter

Label reflects the organizer's action: accepted applications read « Accepted » (qualified while the invitation is unanswered). The funnel tile becomes **Accepted** and counts exactly the rows its filter shows. Message **keys are renamed** (not just values) so tsc catches stragglers.

**Files:**
- Modify: `lib/dashboard/rollup.ts` (`candidaturePill`, `applicantStatusPill`, `lifecycleFunnel`, `lifecycleFilter`, `buildLifecycleRows` doc comment)
- Modify: `components/dashboard/OverviewView.tsx` (one call site: `lifecycleFunnel` gains a `rows` arg)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `lib/dashboard/__tests__/rollup.test.ts`, `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: `LifecycleRow` union from Task 1's file (unchanged shape).
- Produces: **new signature** `lifecycleFunnel(apps: AppRow[], rows: LifecycleRow[], rollups: DossierRollup[], t: T): FunnelStage[]` — the funnel now needs the built rows (dedupe already applied) to count the accepted group. Funnel stage key `'confirmed'` → `'accepted'`; `lifecycleFilter` case `'confirmed'` → `'accepted'` (now also matching `maybe` applicants). New module constant `ACCEPTED_FILTER_STATUSES = ['accepted', 'maybe', 'enrolling', 'enrolled']`. Message keys: `organizer.dashboard.pills.accepted`, `organizer.dashboard.pills.acceptedAwaiting`, `organizer.dashboard.funnel.accepted` (old `pills.confirmedParen`, `pills.confirmed`, `pills.invitedWaiting`, `funnel.confirmed` deleted).

- [ ] **Step 1: Update/add the rollup tests (they will fail first)**

In `lib/dashboard/__tests__/rollup.test.ts`:

1. `describe('candidaturePill')` — replace the `it.each` table with:

```ts
  it.each([
    [null, 'ok', 'Accepté(e)'],
    ['enrolled', 'ok', 'Accepté(e)'], ['enrolling', 'ok', 'Accepté(e)'],
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'Accepté(e) — en attente'],
    ['maybe', 'warn', 'Peut-être'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(candidaturePill(s as string | null, t)).toEqual({ kind, label }))
```

2. `describe('applicantStatusPill')` — replace the `it.each` table with:

```ts
  it.each([
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'En attente'],
    ['enrolled', 'ok', 'Accepté(e)'], ['enrolling', 'ok', 'Accepté(e)'],
    ['maybe', 'warn', 'Hésite'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(applicantStatusPill(s, t)).toEqual({ kind, label }))
```

3. `describe('buildLifecycleRows')` — in the first test, change `expect(rows[2].candidature).toEqual({ kind: 'ok', label: 'Confirmé(e)' })` to `label: 'Accepté(e)'`. In the orphan-fallback test, change `expect(rows[0].candidature).toEqual({ kind: 'ok', label: 'Confirmé(e)' })` to `label: 'Accepté(e)'` and its title from `falls back to a Confirmé applicant row` to `falls back to an Accepté applicant row`.

4. `describe('lifecycleFunnel')` — replace the whole describe block with:

```ts
describe('lifecycleFunnel', () => {
  const APPS2 = [app('submitted'), app('submitted'), app('rejected'), app('declined'), app('accepted')]
  const R2 = [
    rollupStudent({ id: 's1', full_name: 'A' }, T, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'approved' } }, TODAY, t), // complete
    rollupStudent({ id: 's2', full_name: 'B' }, T, { 's2:f1': { assignmentId: 'a3', status: 'approved' }, 's2:d1': { assignmentId: 'a4', status: 'submitted' } }, TODAY, t), // review
    rollupStudent({ id: 's3', full_name: 'C' }, T, {}, new Date('2026-10-11T12:00:00'), t), // late, missing
  ]
  const STUDENTS2: EnrolledStudent[] = [
    { id: 's1', full_name: 'A', email: 'a@x.fr' },
    { id: 's2', full_name: 'B', email: 'b@x.fr' },
    { id: 's3', full_name: 'C', email: 'c@x.fr' },
  ]
  const ROWS2 = buildLifecycleRows(APPS2, STUDENTS2, R2, t)
  it('counts: Candidatures includes closed; Acceptés counts enrolled + accepted applicants; Complets shows « x / y »', () => {
    const f = Object.fromEntries(lifecycleFunnel(APPS2, ROWS2, R2, t).map(s => [s.key, s.count]))
    expect(f).toEqual({ all: 5, toreview: 2, accepted: 4, review: 1, late: 1, complete: 1 })
    const complets = lifecycleFunnel(APPS2, ROWS2, R2, t).find(s => s.key === 'complete')!
    expect(complets.display).toBe('1 / 3')
  })
  it('labels are the French design strings in order', () => {
    expect(lifecycleFunnel([], [], [], t).map(s => s.label))
      .toEqual(['Candidatures', 'À examiner', 'Acceptés', 'À vérifier', 'En retard', 'Complets'])
  })
  it('Acceptés includes maybe applicants and excludes declined/rejected', () => {
    const apps = [app('accepted'), app('maybe'), app('declined'), app('rejected'), app('submitted')]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS, t) // 5 applicants + 1 enrolled (Camille)
    const f = Object.fromEntries(lifecycleFunnel(apps, rows, ROLLUPS, t).map(s => [s.key, s.count]))
    expect(f.accepted).toBe(3) // accepted + maybe + Camille
  })
  it('an unmatched enrolled application (fallback applicant row) counts in Acceptés', () => {
    const apps = [app('enrolled', { email: 'orphan@x.fr' })]
    const rows = buildLifecycleRows(apps, [], [], t)
    const f = Object.fromEntries(lifecycleFunnel(apps, rows, [], t).map(s => [s.key, s.count]))
    expect(f.accepted).toBe(1)
  })
  it('students with nothing assigned never count as complete', () => {
    const empty = rollupStudent({ id: 's9', full_name: 'Vide' }, [], {}, TODAY, t)
    const f = Object.fromEntries(lifecycleFunnel([], [], [empty], t).map(s => [s.key, s.count]))
    expect(f.complete).toBe(0)
    const complets = lifecycleFunnel([], [], [empty], t).find(s => s.key === 'complete')!
    expect(complets.display).toBe('0 / 1')
  })
  it('a forms-only dossier with all forms approved still counts as complete', () => {
    const TF: TemplateInfo[] = [{ id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' }]
    const r = rollupStudent(student, TF, { 's1:f1': { assignmentId: 'a1', status: 'approved' } }, TODAY, t)
    expect(lifecycleFunnel([], [], [r], t).find(s => s.key === 'complete')!.count).toBe(1)
  })
})
```

5. `describe('lifecycleFilter')` — replace the `'"confirmed"'` test with:

```ts
  it('"accepted" → enrolled rows plus accepted/maybe applicants', () => {
    // the maybe applicant (data {} → name falls back to its email) is now included
    expect(lifecycleFilter(rows, 'accepted', false).map(r => r.name)).toEqual(['x@y.fr', 'Camille Laurent', 'Zoé Blanc'])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/dashboard/__tests__/rollup.test.ts`
Expected: FAIL — label mismatches (`'Confirmé(e)'` still rendered) and `lifecycleFunnel` arity/shape errors.

- [ ] **Step 3: Implement in `lib/dashboard/rollup.ts`**

1. Below `CONFIRMED_STATUSES`, add:

```ts
// The funnel's Accepted group: everyone the organizer accepted who hasn't
// declined or been rejected.
const ACCEPTED_FILTER_STATUSES = ['accepted', 'maybe', 'enrolling', 'enrolled']
```

2. `candidaturePill` — the two changed cases:

```ts
    case null:
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: t('organizer.dashboard.pills.accepted') }
```
```ts
    case 'accepted': return { kind: 'warn', label: t('organizer.dashboard.pills.acceptedAwaiting') }
```

3. `applicantStatusPill` — the changed case (the `accepted → waiting` case stays):

```ts
    case 'enrolling':
    case 'enrolled': return { kind: 'ok', label: t('organizer.dashboard.pills.accepted') }
```

4. `buildLifecycleRows` doc comment: change `falls back to an applicant row with a Confirmé pill` to `falls back to an applicant row with an Accepté pill`.

5. `lifecycleFunnel` — new signature + accepted stage:

```ts
// Candidatures counts ALL received applications, including rejected/declined
// (historical volume) — the hide-closed toggle only affects the table. The
// Accepted tile counts exactly the rows its filter shows: enrolled rows plus
// applicant rows still in the accepted group (needs the built rows so the
// enrolled-application dedupe is already applied).
export function lifecycleFunnel(apps: AppRow[], rows: LifecycleRow[], rollups: DossierRollup[], t: T): FunnelStage[] {
  const complete = rollups.filter(r => dossierComplete(r)).length
  const accepted = rows.filter(r => r.kind === 'enrolled' || ACCEPTED_FILTER_STATUSES.includes(r.app.status)).length
  return [
    { key: 'all', label: t('organizer.dashboard.funnel.candidatures'), count: apps.length },
    { key: 'toreview', label: t('organizer.dashboard.pills.toExamine'), count: apps.filter(a => a.status === 'submitted').length },
    { key: 'accepted', label: t('organizer.dashboard.funnel.accepted'), count: accepted },
    { key: 'review', label: t('common.status.toVerify'), count: rollups.filter(r => r.overall.kind === 'info').length },
    { key: 'late', label: t('organizer.dashboard.funnel.late'), count: rollups.filter(r => r.late).length },
    { key: 'complete', label: t('organizer.dashboard.funnel.complete'), count: complete, display: `${complete} / ${rollups.length}` },
  ]
}
```

6. `lifecycleFilter` — replace the `'confirmed'` case:

```ts
    case 'accepted': return visible.filter(r => r.kind === 'enrolled' || ACCEPTED_FILTER_STATUSES.includes(r.app.status))
```

- [ ] **Step 4: Update the one caller in `components/dashboard/OverviewView.tsx`**

```ts
  const funnel = lifecycleFunnel(apps, rows, rollups, tr)
```

(`rows` is already computed a few lines above the current call — keep the order.)

- [ ] **Step 5: Rename the message keys in ALL 5 locale files**

In each of `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`, under `organizer.dashboard`:

- In `pills`: **delete** `"confirmedParen"` and `"confirmed"`; **rename** `"invitedWaiting"` → `"acceptedAwaiting"`; **add** `"accepted"`. Values:

| locale | `pills.accepted` | `pills.acceptedAwaiting` |
|---|---|---|
| en | `Accepted` | `Accepted — awaiting reply` |
| fr | `Accepté(e)` | `Accepté(e) — en attente` |
| es | `Aceptado(a)` | `Aceptado(a) — a la espera` |
| it | `Accettato/a` | `Accettato/a — in attesa` |
| de | `Angenommen` | `Angenommen — wartet auf Antwort` |

- In `funnel`: **rename** `"confirmed"` → `"accepted"`. Values: en `Accepted` · fr `Acceptés` · es `Aceptados` · it `Accettati` · de `Angenommen`.

- [ ] **Step 6: Update the component test assertion**

In `components/dashboard/__tests__/OverviewView.test.tsx`, first test: change `expect(screen.getByText('Confirmé(e)')).toBeInTheDocument()` to `expect(screen.getByText('Accepté(e)')).toBeInTheDocument()`.

- [ ] **Step 7: Verify green**

Run: `pnpm test` → all PASS (incl. `messages/__tests__/parity.test.ts`). Run: `npx tsc --noEmit` → clean (this is the straggler gate: any leftover `pills.confirmed*` / `funnel.confirmed` reference fails here).

- [ ] **Step 8: Commit**

```bash
git add lib/dashboard/rollup.ts components/dashboard/OverviewView.tsx \
  messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json \
  lib/dashboard/__tests__/rollup.test.ts components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): Accepted replaces Confirmed — pills, funnel tile and filter"
```

---

### Task 3: Terminology sweep — « confirmed » → « accepted » in the rest of the organizer portal

Message **values only** (no key renames — semantics of the underlying counts are unchanged: students with accounts). Password/removal-confirm verbs (`confirmPasswordLabel`, `removeDialog.confirm`, `organizer.applications.confirmRejectCta`) are untouched.

**Files:**
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `lib/students/__tests__/directory.test.ts`, `components/students/__tests__/StudentsView.test.tsx`, `components/settings/__tests__/SettingsView.test.tsx`

**Interfaces:**
- Consumes / Produces: nothing typed changes — key paths stay identical, only values change.

- [ ] **Step 1: Update the three test assertions (they will fail first)**

1. `lib/students/__tests__/directory.test.ts` (lines ~165–166):

```ts
      .toBe('3 élèves acceptés · 2 dossiers complets')
    expect(listSummary([mk('a', 'A', 'retard')], t)).toBe('1 élève accepté · 0 dossier complet')
```

2. `components/students/__tests__/StudentsView.test.tsx` (line ~50):

```ts
    expect(screen.getByText('2 élèves acceptés · 1 dossier complet')).toBeInTheDocument()
```

3. `components/settings/__tests__/SettingsView.test.tsx` (line ~165):

```ts
    expect(screen.getByText('10 élèves acceptés · 12 candidatures · échéance dossiers 10 oct')).toBeInTheDocument()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/students components/students components/settings`
Expected: 3 FAIL (old « confirmés » strings still rendered).

- [ ] **Step 3: Update the 5 message values in ALL 5 locale files**

Key paths (all under `organizer`) and exact new values:

**`settings.program.stats.enrolled`**
- en: `{count, plural, one {# accepted student} other {# accepted students}}`
- fr: `{count, plural, one {# élève accepté} other {# élèves acceptés}}`
- es: `{count, plural, one {# alumno aceptado} other {# alumnos aceptados}}`
- it: `{count, plural, one {# studente accettato} other {# studenti accettati}}`
- de: `{count, plural, one {# angenommener Schüler} other {# angenommene Schüler}}`

**`students.listSummary`** (keep the second half of each string exactly as it is today)
- en: `{n, plural, one {# accepted student} other {# accepted students}} · {done, plural, one {# complete file} other {# complete files}}`
- fr: `{n, plural, one {# élève accepté} other {# élèves acceptés}} · {done, plural, one {# dossier complet} other {# dossiers complets}}`
- es: `{n, plural, one {# alumno aceptado} other {# alumnos aceptados}} · {done, plural, one {# expediente completo} other {# expedientes completos}}`
- it: `{n, plural, one {# studente accettato} other {# studenti accettati}} · {done, plural, one {# fascicolo completo} other {# fascicoli completi}}`
- de: `{n, plural, one {# angenommener Schüler} other {# angenommene Schüler}} · {done, plural, one {# vollständiges Dossier} other {# vollständige Dossiers}}`

**`pages.students.emptyHeading`**
- en: `No accepted students for this session yet.`
- fr: `Aucun élève accepté pour cette session.`
- es: `Ningún alumno aceptado para esta sesión.`
- it: `Nessuno studente accettato per questa sessione.`
- de: `Noch keine angenommenen Schüler für diese Session.`

**`documents.addPanel.mandatoryTile.description`**
- en: `Requested from every accepted student — counts toward file completeness.`
- fr: `Demandé à chaque élève accepté — compte dans la complétude du dossier.`
- es: `Solicitado a cada alumno aceptado — cuenta para la integridad del expediente.`
- it: `Richiesto a ogni studente accettato — conta ai fini della completezza del fascicolo.`
- de: `Von jedem angenommenen Schüler angefordert — zählt zur Vollständigkeit des Dossiers.`

**`dashboard.actionCards.maybeDesc`** (drop « convert into confirmation »)
- en: `« Maybe » replies to follow up with families.`
- fr: `Réponses « Peut-être » à relancer.`
- es: `Respuestas «Quizás» para hacer seguimiento con las familias.`
- it: `Risposte « Forse » da ricontattare.`
- de: `„Vielleicht“-Antworten zum Nachfassen bei den Familien.`

- [ ] **Step 4: Verify green**

Run: `pnpm test` → all PASS (parity + the 3 updated suites). Sanity sweep — the only remaining student-describing « confirm » strings should be gone:

```bash
grep -rn "confirmed student\|élève confirmé\|élèves confirmés\|alumno confirmado\|studente confermato\|bestätigte" messages/
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json \
  lib/students/__tests__/directory.test.ts components/students/__tests__/StudentsView.test.tsx \
  components/settings/__tests__/SettingsView.test.tsx
git commit -m "feat(i18n): accepted replaces confirmed across the organizer portal copy"
```

---

### Task 4: Second CTA « Prepare forms & documents » in the empty state

The « Start your exchange » empty state gains a secondary (outline) CTA linking to `/forms`, and the body copy now mentions both steps. The right-rail « No active form » action card is untouched.

**Files:**
- Modify: `components/dashboard/OverviewView.tsx` (the `neverOpened` branch)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`

**Interfaces:**
- Consumes: existing `Link` import (already at the top of `OverviewView.tsx`), existing keys `dashboard.startTitle`, `dashboard.inviteCta`.
- Produces: new message key `organizer.dashboard.prepareFormsCta`; updated `organizer.dashboard.startBody` value.

- [ ] **Step 1: Write the failing test**

Add to `components/dashboard/__tests__/OverviewView.test.tsx`:

```tsx
  it('empty state offers both CTAs: invite (primary) and prepare forms & documents (link to /forms)', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer les formulaires & documents' })).toHaveAttribute('href', '/forms')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- components/dashboard/__tests__/OverviewView.test.tsx`
Expected: new test FAIL (`Unable to find an accessible element with the role "link"`).

- [ ] **Step 3: Add the messages in ALL 5 locale files**

Under `organizer.dashboard`, **replace** `startBody` and **add** `prepareFormsCta` (place it right after `inviteCta`):

| locale | `startBody` | `prepareFormsCta` |
|---|---|---|
| en | `Start your exchange by inviting your students to apply and preparing the forms and documents they will need to complete.` | `Prepare forms & documents` |
| fr | `Commencez votre échange en invitant vos élèves à postuler et en préparant les formulaires et documents qu'ils devront compléter.` | `Préparer les formulaires & documents` |
| es | `Empiece su intercambio invitando a sus alumnos a postularse y preparando los formularios y documentos que deberán completar.` | `Preparar formularios y documentos` |
| it | `Inizia il tuo scambio invitando i tuoi studenti a candidarsi e preparando i moduli e i documenti che dovranno completare.` | `Prepara moduli e documenti` |
| de | `Starten Sie Ihren Austausch, indem Sie Ihre Schüler zur Bewerbung einladen und die Formulare und Dokumente vorbereiten, die sie ausfüllen müssen.` | `Formulare & Dokumente vorbereiten` |

- [ ] **Step 4: Add the CTA in `components/dashboard/OverviewView.tsx`**

In the `neverOpened` branch, replace the single `<button …>` (the invite CTA and its `mt-6` class) with a wrapper holding both CTAs:

```tsx
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex h-[42px] items-center gap-1.5 rounded-[9px] bg-brand px-5 text-[14px] font-semibold text-white hover:bg-brand-hover"
            >
              <span className="text-base leading-none">+</span> {t('dashboard.inviteCta')}
            </button>
            <Link
              href="/forms"
              className="flex h-[42px] items-center rounded-[9px] border border-frame-dashed bg-card px-5 text-[14px] font-semibold text-navy hover:bg-hint"
            >
              {t('dashboard.prepareFormsCta')}
            </Link>
          </div>
```

(The `startBody` paragraph above it is unchanged code — its text updates via the message value.)

- [ ] **Step 5: Verify green**

Run: `pnpm test` → all PASS (incl. parity). Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/OverviewView.tsx \
  messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json \
  components/dashboard/__tests__/OverviewView.test.tsx
git commit -m "feat(dashboard): empty state gains a Prepare forms & documents CTA"
```

---

### Task 5: Applicant rows navigate to the application page; delete the drawer's application branch

Clicking an applicant row navigates to `/applications?id=<applicationId>` (same pattern as `CandidaturesView`). Enrolled rows keep the checklist drawer. The drawer's application branch becomes unreachable — delete it end to end: `DrawerSubject`'s application kind, the timeline + accept/reject UI, `timelineFor` in the rollup lib, and the orphaned messages. Accept/reject then lives in exactly two places: the application page and Candidatures bulk actions. (Known accepted wrinkle: the application page's back link goes to `/applications`, not the Overview.)

**Files:**
- Modify: `components/dashboard/OverviewView.tsx`
- Rewrite: `components/dashboard/StudentDrawer.tsx`
- Modify: `lib/dashboard/rollup.ts` (delete `timelineFor` + `ACCEPTED_GROUP_STATUSES`)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/es.json`, `messages/it.json`, `messages/de.json`
- Test: `components/dashboard/__tests__/OverviewView.test.tsx`, rewrite `components/dashboard/__tests__/StudentDrawer.test.tsx`, `lib/dashboard/__tests__/rollup.test.ts`

**Interfaces:**
- Consumes: `useRouter` from `next/navigation`; `LifecycleRow` (applicant rows carry `app.id`).
- Produces: **new** `DrawerSubject = { rollup: DossierRollup; items: { label: string; group: 'form' | 'doc'; pill: Pill }[] }` (no `kind` discriminant — single variant). `StudentDrawer({ subject, onClose })` prop shape unchanged. `timelineFor` no longer exists — nothing else imports it (verified: only `StudentDrawer` and its tests).

- [ ] **Step 1: Update the OverviewView tests (they will fail first)**

In `components/dashboard/__tests__/OverviewView.test.tsx`:

1. At the top, add a router mock and **delete** the now-unneeded `vi.mock('@/actions/applications-review', …)` line:

```tsx
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
```

2. Replace the `'row click opens the right drawer per row kind'` test with:

```tsx
  it('applicant row click navigates to the application page', () => {
    push.mockClear()
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })

  it('enrolled row click opens the checklist drawer — with no application branch', () => {
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByText('Camille Laurent'))
    expect(screen.getByText(/Formulaires & documents/)).toBeInTheDocument()
    expect(screen.queryByText('Parcours')).toBeNull() // no timeline heading
    expect(screen.queryByRole('button', { name: 'Accepter & inviter' })).toBeNull()
  })
```

- [ ] **Step 2: Rewrite the StudentDrawer tests**

Replace the entire content of `components/dashboard/__tests__/StudentDrawer.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

import { StudentDrawer } from '@/components/dashboard/StudentDrawer'

const subject = {
  rollup: {
    studentId: 's1', name: 'Manon Girard', forms: 'pending' as const, docs: 'missing' as const,
    due: '2026-10-03', late: true, overall: { kind: 'bad' as const, label: 'En retard' },
  },
  items: [{ label: 'Passeport', group: 'doc' as const, pill: { kind: 'bad' as const, label: 'Manquant' } }],
}

describe('StudentDrawer', () => {
  it('renders nothing when subject is null', () => {
    const { container } = renderWithIntl(<StudentDrawer subject={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
  it('shows the checklist with name, overall status and items', () => {
    renderWithIntl(<StudentDrawer subject={subject} onClose={() => {}} />)
    expect(screen.getByText('Manon Girard')).toBeInTheDocument()
    expect(screen.getByText('En retard')).toBeInTheDocument()
    expect(screen.getByText('Passeport')).toBeInTheDocument()
    expect(screen.getByText('Manquant')).toBeInTheDocument()
    expect(screen.getByText(/Formulaires & documents/)).toBeInTheDocument()
  })
  it('has no application review UI (timeline, accept/reject)', () => {
    renderWithIntl(<StudentDrawer subject={subject} onClose={() => {}} />)
    expect(screen.queryByText('Parcours')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accepter & inviter' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull()
  })
  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    renderWithIntl(<StudentDrawer subject={subject} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderWithIntl(<StudentDrawer subject={subject} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Delete the `timelineFor` tests**

In `lib/dashboard/__tests__/rollup.test.ts`: delete the whole `describe('timelineFor', …)` block and remove `timelineFor,` from the import list.

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm test -- components/dashboard lib/dashboard`
Expected: FAIL — OverviewView still opens the drawer for applicants (`push` never called); StudentDrawer still renders the old union type.

- [ ] **Step 5: Rewrite `components/dashboard/StudentDrawer.tsx`**

Replace the entire file with:

```tsx
'use client'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { DossierRollup, Pill } from '@/lib/dashboard/rollup'
import { frShortDate } from '@/lib/dashboard/rollup'
import { StatusPill } from '@/components/dashboard/StatusPill'

export type DrawerSubject = {
  rollup: DossierRollup
  items: { label: string; group: 'form' | 'doc'; pill: Pill }[]
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

export function StudentDrawer({ subject, onClose }: { subject: DrawerSubject | null; onClose: () => void }) {
  const t = useTranslations('organizer')

  useEffect(() => {
    if (!subject) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [subject, onClose])

  if (!subject) return null
  const name = subject.rollup.name

  return (
    <div className="fixed inset-0 z-40">
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-rail/30"
      />
      <div className="absolute right-0 top-0 h-full w-[420px] bg-card shadow-modal p-7 overflow-auto animate-[drwIn_.25s_ease-out]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-tint text-tint-text font-mono text-[13px] font-semibold">
            {initials(name)}
          </span>
          <span className="font-display text-lg font-bold text-navy">{name}</span>
          <StatusPill pill={subject.rollup.overall} />
          <button type="button" onClick={onClose} className="ml-auto text-placeholder hover:text-navy">
            ✕
          </button>
        </div>

        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary mt-6 mb-3">
          {t('dashboard.formsAndDocsHeading')}
          {subject.rollup.due ? t('dashboard.dueSuffix', { date: frShortDate(subject.rollup.due) }) : ''}
        </div>
        <div>
          {subject.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <span className="text-sm text-navy">{item.label}</span>
              <StatusPill pill={item.pill} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-start mt-4 text-[12.5px] text-muted-foreground">
          <span className="text-brand">&#8635;</span>
          <span>{t('dashboard.autoReminderHint')}</span>
        </div>
      </div>
    </div>
  )
}
```

(Everything about accept/reject, the timeline, `timelineFor`, `applicantStatusPill`, `applicantName`, the actions import, and the two-step Escape handler is gone — Escape now closes directly.)

- [ ] **Step 6: Update `components/dashboard/OverviewView.tsx`**

1. Add the router import and hook:

```ts
import { useRouter } from 'next/navigation'
```
and inside the component, next to the other hooks:
```ts
  const router = useRouter()
```

2. `studentSubject` drops the `kind` field — change its return to:

```ts
    return { rollup, items }
```

3. **Delete** the `rowSubject` function entirely.

4. In the table row, replace `onClick={() => setSelected(rowSubject(row))}` with:

```tsx
                onClick={() =>
                  row.kind === 'applicant'
                    ? router.push(`/applications?id=${row.app.id}`)
                    : setSelected(studentSubject(row.rollup))
                }
```

- [ ] **Step 7: Delete `timelineFor` from `lib/dashboard/rollup.ts`**

Delete the whole `timelineFor` function (currently lines 148–176) and the now-unused `const ACCEPTED_GROUP_STATUSES = […]` line. Keep `CONFIRMED_STATUSES` (still used by the merge, name fallback and nothing else).

- [ ] **Step 8: Delete the orphaned messages in ALL 5 locale files**

First verify each key is truly unused now (expect no output):

```bash
grep -rn "dashboard.timeline\b\|timelineHeading\|dashboard.acceptCta\|dashboard.rejectCta\|dashboard.confirmRejectCta\|dashboard.sending\|dashboard.notePlaceholder\|dashboard.notifyByEmail" app components lib
```

Then in each of the 5 locale files, under `organizer.dashboard`, delete these keys (they were only ever used by the drawer's application branch — `CandidaturesView`/`ApplicationReviewActions` use the separate `organizer.applications.*` keys, which stay):

- the whole `"timeline"` object
- `"timelineHeading"`, `"acceptCta"`, `"rejectCta"`, `"confirmRejectCta"`, `"sending"`, `"notePlaceholder"`, `"notifyByEmail"`

- [ ] **Step 9: Verify green**

Run: `pnpm test` → all PASS (incl. parity across the 5 locales). Run: `npx tsc --noEmit` → clean (catches any surviving reference to a deleted key, `timelineFor`, or the old `DrawerSubject` union).

- [ ] **Step 10: Commit**

```bash
git add components/dashboard/OverviewView.tsx components/dashboard/StudentDrawer.tsx \
  lib/dashboard/rollup.ts lib/dashboard/__tests__/rollup.test.ts \
  components/dashboard/__tests__/OverviewView.test.tsx components/dashboard/__tests__/StudentDrawer.test.tsx \
  messages/en.json messages/fr.json messages/es.json messages/it.json messages/de.json
git commit -m "feat(dashboard): applicant rows open the application page; drop the drawer's application branch"
```

---

### Task 6: Full gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

```bash
pnpm lint && pnpm test && npx tsc --noEmit
```
Expected: lint clean, all vitest suites pass, tsc clean. (`pnpm build` runs in CI; locally it fails on placeholder `.env.local` values — do not chase that.)

- [ ] **Step 2: Confirm no stray staged/untracked product files**

```bash
git status --short && git diff main --stat
```
Expected: only the files named in Tasks 1–5.

- [ ] **Step 3: Hand off**

Use superpowers:requesting-code-review, then superpowers:finishing-a-development-branch (merge to `main` needs Bjorn's confirmation before any push — Vercel deploys `main` to production).

---

## Self-review notes

- Spec §1 → Task 4. Spec §2 → Task 1. Spec §3 (pills, funnel count+filter+`maybe`, key renames) → Task 2. Spec §3 sweep (5 keys) → Task 3. Spec §4 (navigation + drawer/`timelineFor`/messages cleanup) → Task 5. Spec Testing section → each task's test steps + Task 6 gate.
- The funnel-count change required a signature change (`lifecycleFunnel` gains `rows`) because the accepted tile must count deduped rows, not raw apps — the spec's "exactly the rows the tile's filter shows" is otherwise unachievable. Single caller updated in Task 2.
- Orphaned-key deletion in Task 5 goes slightly beyond the spec's explicit `timeline.*` (also `timelineHeading`, `acceptCta`, `rejectCta`, `confirmRejectCta`, `sending`, `notePlaceholder`, `notifyByEmail`): all verified used only by the deleted drawer branch; a grep guard step protects the deletion. The spec's "confirmRejectCta untouched" note refers to `organizer.applications.confirmRejectCta` (the reject-confirm verb), which stays.
