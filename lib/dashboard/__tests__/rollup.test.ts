import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import {
  frShortDate,
  rollupStudent, formsPill, docsPill,
  timelineFor, nextDeadline, p,
  candidaturePill, applicantStatusPill, buildLifecycleRows, closedCount,
  lifecycleFunnel, lifecycleFilter, lifecycleSubline, lifecycleActionCards, exchangeProgress,
  type AppRow, type TemplateInfo, type CellMap, type EnrolledStudent,
} from '@/lib/dashboard/rollup'

// Root (unnamespaced) fr translator — the label helpers now build their strings
// through next-intl, so the assertions below prove the fr catalog renders the
// exact French design strings byte-for-byte.
const t = createTranslator({ locale: 'fr', messages: fr })

const app = (status: string, over: Partial<AppRow> = {}): AppRow =>
  ({ id: Math.random().toString(), status, submitted_at: '2026-09-12', data: {}, email: 'x@y.fr', ...over })

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
  it('no templates → complete', () => {
    const r = rollupStudent(student, [], {}, TODAY, t)
    expect(r.overall).toEqual({ kind: 'ok', label: 'Complet' })
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
  ])('formsPill %s → %s %s', (s, kind, label) => expect(formsPill(s as any, t)).toEqual({ kind, label }))
  it.each([
    ['complete', 'ok', 'Complet'], ['review', 'info', 'À vérifier'],
    ['pending', 'warn', 'En cours'], ['missing', 'bad', 'Manquant'],
  ])('docsPill %s → %s %s', (s, kind, label) => expect(docsPill(s as any, t)).toEqual({ kind, label }))
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

describe('copy builders', () => {
  it('frShortDate strips the dot', () => {
    expect(frShortDate('2026-09-12')).toBe('12 sept')
    expect(frShortDate(null)).toBe('')
    expect(frShortDate('')).toBe('')
  })
  it('frShortDate accepts timestamptz input (full ISO with time + timezone)', () => {
    expect(frShortDate('2026-09-12T18:23:45.123+00:00')).toBe('12 sept')
  })
  it('frShortDate guards invalid dates', () => {
    expect(frShortDate('not-a-date')).toBe('')
  })
  it('p pluralizes only above 1', () => {
    expect(p(0)).toBe(''); expect(p(1)).toBe(''); expect(p(2)).toBe('s')
  })
})

describe('timelineFor', () => {
  it('submitted app', () => {
    expect(timelineFor(app('submitted'), t).map(e => e.title))
      .toEqual(['Candidature reçue', 'En attente d’examen'])
  })
  it('rejected app', () => {
    expect(timelineFor(app('rejected'), t).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature refusée'])
  })
  it('accepted app (awaiting response)', () => {
    expect(timelineFor(app('accepted'), t).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'En attente de réponse'])
  })
  it('maybe app', () => {
    expect(timelineFor(app('maybe'), t).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Peut-être'])
  })
  it('declined app', () => {
    expect(timelineFor(app('declined'), t).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Non'])
  })
  it('confirmed app has the full happy path', () => {
    expect(timelineFor(app('enrolled'), t).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Oui'])
  })
})

// ---- Unified lifecycle view ----

const STUDENTS: EnrolledStudent[] = [{ id: 's1', full_name: 'Camille Laurent', email: 'c@l.fr' }]
const ROLLUPS = [rollupStudent(student, T, cell('approved', 'approved'), TODAY, t)]

describe('candidaturePill', () => {
  it.each([
    [null, 'ok', 'Confirmé(e)'],
    ['enrolled', 'ok', 'Confirmé(e)'], ['enrolling', 'ok', 'Confirmé(e)'],
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'Invité — en attente'],
    ['maybe', 'warn', 'Peut-être'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(candidaturePill(s as string | null, t)).toEqual({ kind, label }))
})

describe('applicantStatusPill', () => {
  it.each([
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'En attente'],
    ['enrolled', 'ok', 'Confirmé'], ['enrolling', 'ok', 'Confirmé'],
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
    expect(rows[2].candidature).toEqual({ kind: 'ok', label: 'Confirmé(e)' })
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
  it('an enrolled application with no matching student falls back to a Confirmé applicant row (never dropped)', () => {
    const apps = [app('enrolled', { id: 'a1', email: 'orphan@x.fr', data: { first_name: 'Léo', last_name: 'Roy' } })]
    const rows = buildLifecycleRows(apps, [], [], t)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('applicant')
    expect(rows[0].candidature).toEqual({ kind: 'ok', label: 'Confirmé(e)' })
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
  it('counts: Candidatures includes closed; Complets shows « x / y »', () => {
    const f = Object.fromEntries(lifecycleFunnel(APPS2, R2, t).map(s => [s.key, s.count]))
    expect(f).toEqual({ all: 5, toreview: 2, confirmed: 3, review: 1, late: 1, complete: 1 })
    const complets = lifecycleFunnel(APPS2, R2, t).find(s => s.key === 'complete')!
    expect(complets.display).toBe('1 / 3')
  })
  it('labels are the French design strings in order', () => {
    expect(lifecycleFunnel([], [], t).map(s => s.label))
      .toEqual(['Candidatures', 'À examiner', 'Confirmés', 'À vérifier', 'En retard', 'Complets'])
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
})

describe('exchangeProgress', () => {
  it('dossier progress once students are enrolled', () => {
    const R2 = [ROLLUPS[0], rollupStudent({ id: 's2', full_name: 'B' }, T, {}, TODAY, t)]
    expect(exchangeProgress([app('submitted')], R2, t)).toEqual({ done: 1, total: 2, label: '1 / 2 dossiers validés' })
  })
  it('candidature progress before any enrollment', () => {
    expect(exchangeProgress([app('submitted'), app('accepted')], [], t))
      .toEqual({ done: 1, total: 2, label: '1 / 2 candidatures traitées' })
  })
})
