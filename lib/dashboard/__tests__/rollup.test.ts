import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import {
  rollupStudent, formsPill, docsPill, dossierComplete,
  nextDeadline,
  candidaturePill, applicantStatusPill, buildLifecycleRows, closedCount,
  lifecycleFunnel, lifecycleFilter, lifecycleSubline, lifecycleActionCards, progressSummary,
  type AppRow, type TemplateInfo, type CellMap, type EnrolledStudent, type DossierRollup,
} from '@/lib/dashboard/rollup'

// Root (unnamespaced) fr translator — the label helpers now build their strings
// through next-intl, so the assertions below prove the fr catalog renders the
// exact French design strings byte-for-byte.
const t = createTranslator({ locale: 'fr', messages: fr })

const app = (status: string, over: Partial<AppRow> = {}): AppRow =>
  ({ id: Math.random().toString(), status, submitted_at: '2026-09-12', responded_at: null, data: {}, email: 'x@y.fr', ...over })

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
    const r = rollupStudent(student, T, cell('approved', 'approved'), TODAY, t)
    expect(r.forms).toBe('complete'); expect(r.docs).toBe('complete')
    expect(r.overall).toEqual({ kind: 'ok', label: 'Complet' }); expect(r.due).toBeNull(); expect(r.late).toBe(false)
  })
  it('doc awaiting review wins overall', () => {
    const r = rollupStudent(student, T, cell('approved', 'submitted'), TODAY, t)
    expect(r.docs).toBe('review'); expect(r.overall).toEqual({ kind: 'info', label: 'À vérifier' })
  })
  it('nothing started → missing + due', () => {
    const r = rollupStudent(student, T, cell('', ''), TODAY, t)
    expect(r.forms).toBe('missing'); expect(r.docs).toBe('missing'); expect(r.due).toBe('2026-10-10'); expect(r.late).toBe(false)
  })
  it('late when past deadline and incomplete', () => {
    const r = rollupStudent(student, T, cell('draft', ''), new Date('2026-10-11T12:00:00'), t)
    expect(r.late).toBe(true); expect(r.overall).toEqual({ kind: 'bad', label: 'En retard' })
  })
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
  it('rejected submission counts as incomplete for due/late, but as started for forms/docs', () => {
    const r = rollupStudent(student, T, cell('rejected', 'rejected'), TODAY, t)
    expect(r.forms).toBe('pending'); expect(r.docs).toBe('pending')
    // still incomplete for due/late purposes
    expect(r.due).toBe('2026-10-10')
  })
  it('draft submission on a data_entry template → forms pending (started, not complete)', () => {
    const r = rollupStudent(student, T, cell('draft', ''), TODAY, t)
    expect(r.forms).toBe('pending')
  })
  it('rejected submission on a document_upload template → docs pending (started, not complete)', () => {
    const r = rollupStudent(student, T, cell('', 'rejected'), TODAY, t)
    expect(r.docs).toBe('pending')
  })
  it('truly no submission rows → missing', () => {
    const r = rollupStudent(student, T, cell('', ''), TODAY, t)
    expect(r.forms).toBe('missing'); expect(r.docs).toBe('missing')
  })
  it('pending: some but not all forms submitted/approved', () => {
    const T2: TemplateInfo[] = [
      { id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' },
      { id: 'f2', type: 'data_entry', name: 'Autre', deadline: '2026-10-20' },
    ]
    const m: CellMap = { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:f2': { assignmentId: 'a2', status: undefined } }
    const r = rollupStudent(student, T2, m, TODAY, t)
    expect(r.forms).toBe('pending')
    // due = earliest deadline among incomplete assignments → f2's 2026-10-20
    expect(r.due).toBe('2026-10-20')
  })
})

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

describe('nextDeadline', () => {
  it('earliest incomplete due across students', () => {
    const rollups = [
      rollupStudent(student, T, cell('approved', 'approved'), TODAY, t), // due null
      rollupStudent(student, T, cell('', ''), TODAY, t), // due 2026-10-10
    ]
    expect(nextDeadline(rollups)).toBe('2026-10-10')
  })
  it('null when nothing incomplete', () => {
    const rollups = [rollupStudent(student, T, cell('approved', 'approved'), TODAY, t)]
    expect(nextDeadline(rollups)).toBeNull()
  })
})

// ---- Unified lifecycle view ----

const STUDENTS: EnrolledStudent[] = [{ id: 's1', full_name: 'Camille Laurent', email: 'c@l.fr' }]
const ROLLUPS = [rollupStudent(student, T, cell('approved', 'approved'), TODAY, t)]

describe('candidaturePill', () => {
  it.each([
    [null, 'ok', 'Accepté(e)'],
    ['enrolled', 'ok', 'Accepté(e)'], ['enrolling', 'ok', 'Accepté(e)'],
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'Accepté(e) — en attente'],
    ['maybe', 'warn', 'Peut-être'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(candidaturePill(s as string | null, t)).toEqual({ kind, label }))
})

describe('applicantStatusPill', () => {
  it.each([
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'En attente'],
    ['enrolled', 'ok', 'Accepté(e)'], ['enrolling', 'ok', 'Accepté(e)'],
    ['maybe', 'warn', 'Hésite'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(applicantStatusPill(s, t)).toEqual({ kind, label }))
})

describe('buildLifecycleRows', () => {
  it('applicant rows first (apps order), then enrolled rows (students order)', () => {
    const apps = [app('submitted', { id: 'a1' }), app('maybe', { id: 'a2' })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)
    expect(rows.map(r => r.kind)).toEqual(['applicant', 'applicant', 'enrolled'])
    expect(rows[2].name).toBe('Camille Laurent')
    expect(rows[2].candidature).toEqual({ kind: 'ok', label: 'Accepté(e)' })
  })
  it('merges an enrolled application into the matching student row (dedupe by email)', () => {
    const apps = [app('enrolled', { id: 'a1', email: 'c@l.fr', data: { first_name: 'Camille', last_name: 'Laurent' } })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('enrolled')
  })
  it('dedupe is case- and whitespace-insensitive', () => {
    const apps = [app('enrolling', { id: 'a1', email: ' C@L.FR ' })]
    expect(buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)).toHaveLength(1)
  })
  it('an enrolled application with no matching student falls back to an Accepté applicant row (never dropped)', () => {
    const apps = [app('enrolled', { id: 'a1', email: 'orphan@x.fr', data: { first_name: 'Léo', last_name: 'Roy' } })]
    const rows = buildLifecycleRows(apps, [], [], t)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('applicant')
    expect(rows[0].candidature).toEqual({ kind: 'ok', label: 'Accepté(e)' })
  })
  it('a non-confirmed application is NOT merged even if its email matches a student', () => {
    const apps = [app('declined', { id: 'a1', email: 'c@l.fr' })]
    expect(buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)).toHaveLength(2)
  })
  it('flags rejected and declined rows as closed; names fall back to email', () => {
    const apps = [app('rejected', { id: 'a1', email: 'r@x.fr' }), app('declined', { id: 'a2' }), app('submitted', { id: 'a3' })]
    const rows = buildLifecycleRows(apps, [], [], t)
    expect(rows.map(r => r.kind === 'applicant' && r.closed)).toEqual([true, true, false])
    expect(rows[0].name).toBe('r@x.fr')
  })
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
  it('an enrolled student inherits respondedAt from the matching application', () => {
    const D = '2026-09-18T12:00:00.000+00:00'
    const apps = [app('enrolled', { id: 'a1', email: ' C@L.FR ', responded_at: D })]
    const rows = buildLifecycleRows(apps, STUDENTS, ROLLUPS, t)
    expect(rows).toHaveLength(1)
    expect(rows[0].respondedAt).toBe(D)
  })
  it('an enrolled student with no matching application has respondedAt null', () => {
    const rows = buildLifecycleRows([], STUDENTS, ROLLUPS, t)
    expect(rows[0].respondedAt).toBeNull()
  })
  // The rule is responded_at alone: every status the invitee replied on carries
  // a date, not just the ones that ended in enrollment.
  it.each(['declined', 'maybe', 'enrolling', 'enrolled'])(
    'a %s applicant row exposes its own responded_at', status => {
      const D = '2026-09-18T12:00:00.000+00:00'
      const apps = [app(status, { id: 'a1', email: 'm@x.fr', responded_at: D })]
      expect(buildLifecycleRows(apps, [], [], t)[0].respondedAt).toBe(D)
    },
  )
  // …and statuses that only record an organizer decision stay bare.
  it.each(['submitted', 'accepted', 'rejected', 'invited', 'draft'])(
    'a %s applicant row has respondedAt null when the invitee never replied', status => {
      const apps = [app(status, { id: 'a1', email: 'm@x.fr', responded_at: null })]
      expect(buildLifecycleRows(apps, [], [], t)[0].respondedAt).toBeNull()
    },
  )
  it('an orphan enrolled application keeps its respondedAt on the fallback applicant row', () => {
    const D = '2026-09-18T12:00:00.000+00:00'
    const apps = [app('enrolled', { id: 'a1', email: 'orphan@x.fr', responded_at: D })]
    const rows = buildLifecycleRows(apps, [], [], t)
    expect(rows[0].kind).toBe('applicant')
    expect(rows[0].respondedAt).toBe(D)
  })
})

describe('closedCount', () => {
  it('counts rejected + declined applicant rows', () => {
    const rows = buildLifecycleRows([app('rejected'), app('declined'), app('submitted')], STUDENTS, ROLLUPS, t)
    expect(closedCount(rows)).toBe(2)
  })
})

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

describe('lifecycleFilter', () => {
  const late = rollupStudent({ id: 's2', full_name: 'Zoé Blanc' }, T, {}, new Date('2026-10-11T12:00:00'), t)
  const students2: EnrolledStudent[] = [...STUDENTS, { id: 's2', full_name: 'Zoé Blanc', email: 'z@b.fr' }]
  const rows = buildLifecycleRows(
    [app('submitted', { id: 'a1' }), app('maybe', { id: 'a2' }), app('rejected', { id: 'a3' })],
    students2, [...ROLLUPS, late], t,
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
  it('"accepted" → enrolled rows plus accepted/maybe applicants', () => {
    // the maybe applicant (data {} → name falls back to its email) is now included
    expect(lifecycleFilter(rows, 'accepted', false).map(r => r.name)).toEqual(['x@y.fr', 'Camille Laurent', 'Zoé Blanc'])
  })
  it('"late"/"missingdocs"/"complete" filter by rollup state', () => {
    expect(lifecycleFilter(rows, 'late', false).map(r => r.name)).toEqual(['Zoé Blanc'])
    expect(lifecycleFilter(rows, 'missingdocs', false).map(r => r.name)).toEqual(['Zoé Blanc'])
    expect(lifecycleFilter(rows, 'complete', false).map(r => r.name)).toEqual(['Camille Laurent'])
  })
  it('"complete" excludes students with nothing assigned', () => {
    const empty = rollupStudent({ id: 's9', full_name: 'Vide' }, [], {}, TODAY, t)
    const rowsEmpty = buildLifecycleRows([], [{ id: 's9', full_name: 'Vide', email: 'v@x.fr' }], [empty], t)
    expect(lifecycleFilter(rowsEmpty, 'complete', false)).toEqual([])
  })
})

describe('lifecycleSubline', () => {
  it('mixes both worlds with pluralization', () => {
    const R2 = [
      rollupStudent({ id: 's1', full_name: 'A' }, T, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'submitted' } }, TODAY, t),
      rollupStudent({ id: 's2', full_name: 'B' }, T, {}, new Date('2026-10-11T12:00:00'), t),
    ]
    expect(lifecycleSubline([app('submitted'), app('submitted')], R2, t))
      .toBe('2 candidatures à examiner, 1 dossier à vérifier, 1 élève en retard.')
  })
})

describe('lifecycleActionCards', () => {
  it('orders by urgency: toreview, review, late, missingdocs, maybe — omitting zero counts', () => {
    const R2 = [
      rollupStudent({ id: 's1', full_name: 'A' }, T, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'submitted' } }, TODAY, t), // review
      rollupStudent({ id: 's2', full_name: 'B' }, T, {}, new Date('2026-10-11T12:00:00'), t), // late + missing docs
    ]
    const cards = lifecycleActionCards([app('submitted'), app('maybe')], R2, undefined, t)
    expect(cards.map(c => c.filterKey)).toEqual(['toreview', 'review', 'late', 'missingdocs', 'maybe'])
    expect(cards[0].title).toBe('1 candidature à examiner')
  })
  it('prepends the no-active-forms card when activeTemplateCount is 0', () => {
    const cards = lifecycleActionCards([], [], 0, t)
    expect(cards.map(c => c.filterKey)).toEqual(['noforms'])
    expect(cards[0].href).toBe('/forms')
  })
  it('returns nothing when all is quiet', () => {
    expect(lifecycleActionCards([app('enrolled')], ROLLUPS, 3, t)).toEqual([])
  })
  it('deep-links the to-review card to the Applications page, To review tab', () => {
    const cards = lifecycleActionCards([app('submitted')], [], 3, t)
    expect(cards.map(c => c.filterKey)).toEqual(['toreview'])
    expect(cards[0].href).toBe('/applications?tab=toreview')
  })
})

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
