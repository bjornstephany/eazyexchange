import { describe, it, expect } from 'vitest'
import {
  frShortDate, p1Funnel, p1Filter, p1StatusPill, p1ResponsePill,
  rollupStudent, p2Funnel, p2Filter, formsPill, docsPill, actionCards,
  reminderLine, overviewSubline, progress, timelineFor, nextDeadline, p,
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

describe('p1Filter', () => {
  it('null or "all" returns every row', () => {
    expect(p1Filter(APPS, null)).toEqual(APPS)
    expect(p1Filter(APPS, 'all')).toEqual(APPS)
  })
  it('"maybe" returns only maybe rows', () => {
    const res = p1Filter(APPS, 'maybe')
    expect(res.every(a => a.status === 'maybe')).toBe(true)
    expect(res.length).toBe(1)
  })
  it('"toreview" returns only submitted rows', () => {
    expect(p1Filter(APPS, 'toreview').length).toBe(2)
  })
})

describe('pills', () => {
  it.each([
    ['submitted', 'neutral', 'À examiner'], ['accepted', 'warn', 'En attente'],
    ['enrolled', 'ok', 'Confirmé'], ['enrolling', 'ok', 'Confirmé'],
    ['maybe', 'warn', 'Hésite'], ['declined', 'bad', 'A décliné'], ['rejected', 'bad', 'Refusé'],
    ['bogus', 'neutral', '—'],
  ])('%s → %s %s', (s, kind, label) => expect(p1StatusPill(s)).toEqual({ kind, label }))
  it('response pill', () => {
    expect(p1ResponsePill('enrolled')).toEqual({ kind: 'ok', label: 'Oui' })
    expect(p1ResponsePill('enrolling')).toEqual({ kind: 'ok', label: 'Oui' })
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
  it('rejected submission counts as incomplete for due/late, but as started for forms/docs', () => {
    const r = rollupStudent(student, T, cell('rejected', 'rejected'), TODAY)
    expect(r.forms).toBe('pending'); expect(r.docs).toBe('pending')
    // still incomplete for due/late purposes
    expect(r.due).toBe('2026-10-10')
  })
  it('draft submission on a data_entry template → forms pending (started, not complete)', () => {
    const r = rollupStudent(student, T, cell('draft', ''), TODAY)
    expect(r.forms).toBe('pending')
  })
  it('rejected submission on a document_upload template → docs pending (started, not complete)', () => {
    const r = rollupStudent(student, T, cell('', 'rejected'), TODAY)
    expect(r.docs).toBe('pending')
  })
  it('truly no submission rows → missing', () => {
    const r = rollupStudent(student, T, cell('', ''), TODAY)
    expect(r.forms).toBe('missing'); expect(r.docs).toBe('missing')
  })
  it('pending: some but not all forms submitted/approved', () => {
    const T2: TemplateInfo[] = [
      { id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' },
      { id: 'f2', type: 'data_entry', name: 'Autre', deadline: '2026-10-20' },
    ]
    const m: CellMap = { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:f2': { assignmentId: 'a2', status: undefined } }
    const r = rollupStudent(student, T2, m, TODAY)
    expect(r.forms).toBe('pending')
    // due = earliest deadline among incomplete assignments → f2's 2026-10-20
    expect(r.due).toBe('2026-10-20')
  })
})

describe('p2Funnel', () => {
  it('counts every stage per the design mapping', () => {
    const rollups = [
      rollupStudent(student, T, cell('approved', 'approved'), TODAY), // complete
      rollupStudent(student, T, cell('approved', 'submitted'), TODAY), // review
      rollupStudent(student, T, cell('', ''), TODAY), // missing forms+docs
      rollupStudent(student, T, cell('draft', ''), new Date('2026-10-11T12:00:00')), // late
    ]
    const f = Object.fromEntries(p2Funnel(rollups).map(s => [s.key, s.count]))
    expect(f).toEqual({ p2all: 4, pendingforms: 2, review: 1, missingdocs: 2, late: 1 })
  })
  it('labels are the French design strings in order', () => {
    expect(p2Funnel([]).map(s => s.label)).toEqual(['Confirmés', 'Formul. en attente', 'À vérifier', 'Docs manquants', 'En retard'])
  })
})

describe('p2Filter', () => {
  it('null or "all"/"p2all" returns every row (mirrors p1Filter shape)', () => {
    const rollups = [rollupStudent(student, T, cell('approved', 'approved'), TODAY)]
    expect(p2Filter(rollups, null)).toEqual(rollups)
  })
  it('"late" returns only late rollups', () => {
    const rollups = [
      rollupStudent(student, T, cell('approved', 'approved'), TODAY),
      rollupStudent(student, T, cell('draft', ''), new Date('2026-10-11T12:00:00')),
    ]
    const res = p2Filter(rollups, 'late')
    expect(res.every(r => r.late)).toBe(true)
    expect(res.length).toBe(1)
  })
})

describe('formsPill / docsPill', () => {
  it.each([
    ['complete', 'ok', 'Reçu'], ['pending', 'warn', 'En cours'], ['missing', 'bad', 'Manquant'],
  ])('formsPill %s → %s %s', (s, kind, label) => expect(formsPill(s as any)).toEqual({ kind, label }))
  it.each([
    ['complete', 'ok', 'Complet'], ['review', 'info', 'À vérifier'],
    ['pending', 'warn', 'En cours'], ['missing', 'bad', 'Manquant'],
  ])('docsPill %s → %s %s', (s, kind, label) => expect(docsPill(s as any)).toEqual({ kind, label }))
})

describe('nextDeadline', () => {
  it('earliest incomplete due across students', () => {
    const rollups = [
      rollupStudent(student, T, cell('approved', 'approved'), TODAY), // due null
      rollupStudent(student, T, cell('', ''), TODAY), // due 2026-10-10
    ]
    expect(nextDeadline(rollups)).toBe('2026-10-10')
  })
  it('null when nothing incomplete', () => {
    const rollups = [rollupStudent(student, T, cell('approved', 'approved'), TODAY)]
    expect(nextDeadline(rollups)).toBeNull()
  })
})

describe('copy builders', () => {
  it('action cards P1 pluralize and omit zero counts', () => {
    const cards = actionCards(1, [app('submitted'), app('submitted'), app('maybe')], [])
    expect(cards.map(c => c.title)).toEqual(['2 candidatures à examiner', '1 élève hésite — à relancer'])
    expect(actionCards(1, [app('enrolled')], [])).toEqual([])
  })
  it('action cards P1 pluralizes hésitent for multiple maybes', () => {
    const cards = actionCards(1, [app('maybe'), app('maybe')], [])
    expect(cards.map(c => c.title)).toEqual(['2 élèves hésitent — à relancer'])
  })
  it('action cards P2 pluralize and omit zero counts', () => {
    const T2: TemplateInfo[] = [
      { id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' },
      { id: 'd1', type: 'document_upload', name: 'Passeport', deadline: '2026-10-10' },
    ]
    const rollups = [
      rollupStudent({ id: 's1', full_name: 'A' }, T2, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'submitted' } }, TODAY), // review
      rollupStudent({ id: 's2', full_name: 'B' }, T2, {}, new Date('2026-10-11T12:00:00')), // late + missing docs
    ]
    const cards = actionCards(2, [], rollups)
    expect(cards.map(c => c.title)).toEqual([
      '1 dossier à vérifier', '1 élève : documents manquants', '1 élève en retard',
    ])
  })
  it('reminder line P1 counts waiting + maybe', () => {
    expect(reminderLine(1, [app('accepted'), app('maybe')], []))
      .toBe('Relance automatique demain 8h — 2 élèves relancés sur leur candidature ou leur réponse, avec la date limite.')
  })
  it('reminder line P2 counts missingdocs + pendingforms', () => {
    const rollups = [rollupStudent(student, T, cell('', ''), TODAY)]
    expect(reminderLine(2, [], rollups))
      .toBe('Relance automatique demain 8h — 1 élève relancé sur les documents manquants, avec la date limite.')
  })
  it('reminder line P2 counts distinct students: one missing both forms and docs is one distinct student', () => {
    const s1 = { id: 's1', full_name: 'Alice' }
    const s2 = { id: 's2', full_name: 'Bob' }
    const rollups = [
      rollupStudent(s1, T, cell('', ''), TODAY), // missing both forms and docs
      rollupStudent(s2, T, { 's2:f1': { assignmentId: 'a1', status: 'approved' }, 's2:d1': { assignmentId: 'a2', status: 'approved' } }, TODAY), // complete
    ]
    expect(reminderLine(2, [], rollups))
      .toBe('Relance automatique demain 8h — 1 élève relancé sur les documents manquants, avec la date limite.')
  })
  it('progress P1', () => {
    expect(progress(1, [app('submitted'), app('enrolled')], []))
      .toEqual({ done: 1, total: 2, label: '1 / 2 candidatures traitées' })
  })
  it('progress P2', () => {
    const rollups = [
      rollupStudent(student, T, cell('approved', 'approved'), TODAY),
      rollupStudent(student, T, cell('', ''), TODAY),
    ]
    expect(progress(2, [], rollups)).toEqual({ done: 1, total: 2, label: '1 / 2 dossiers validés' })
  })
  it('overviewSubline P1', () => {
    expect(overviewSubline(1, [app('submitted'), app('enrolled')], []))
      .toBe('Phase 1 · Recrutement — 1 candidature à examiner, 1 élève déjà confirmé.')
  })
  it('overviewSubline P2', () => {
    const T2: TemplateInfo[] = [
      { id: 'f1', type: 'data_entry', name: 'Santé', deadline: '2026-10-10' },
      { id: 'd1', type: 'document_upload', name: 'Passeport', deadline: '2026-10-10' },
    ]
    const rollups = [
      rollupStudent({ id: 's1', full_name: 'A' }, T2, { 's1:f1': { assignmentId: 'a1', status: 'approved' }, 's1:d1': { assignmentId: 'a2', status: 'submitted' } }, TODAY),
      rollupStudent({ id: 's2', full_name: 'B' }, T2, {}, TODAY),
    ]
    expect(overviewSubline(2, [], rollups))
      .toBe('Phase 2 · Préparation — 1 dossier à vérifier, 1 en attente de documents.')
  })
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
    expect(timelineFor(app('submitted')).map(e => e.title))
      .toEqual(['Candidature reçue', 'En attente d’examen'])
  })
  it('rejected app', () => {
    expect(timelineFor(app('rejected')).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature refusée'])
  })
  it('accepted app (awaiting response)', () => {
    expect(timelineFor(app('accepted')).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'En attente de réponse'])
  })
  it('maybe app', () => {
    expect(timelineFor(app('maybe')).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Peut-être'])
  })
  it('declined app', () => {
    expect(timelineFor(app('declined')).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Non'])
  })
  it('confirmed app has the full happy path', () => {
    expect(timelineFor(app('enrolled')).map(e => e.title))
      .toEqual(['Candidature reçue', 'Candidature acceptée', 'Invitation envoyée automatiquement', 'A répondu : Oui'])
  })
})
