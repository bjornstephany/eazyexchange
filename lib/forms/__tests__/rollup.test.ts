import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import {
  typePill, statusPill, reqPill, formDone, docDone, progressLabel, progressPct,
  docAttentionPill, studentPill, docDrawerRows, formsStats, docsStats,
  earliestActiveDeadline, initials, activationHints, type TemplateVM, type AssigneeRow,
} from '@/lib/forms/rollup'

// Root (unnamespaced) fr translator — the label helpers now build their strings
// through next-intl, so the assertions below prove the fr catalog renders the
// exact French design strings byte-for-byte.
const t = createTranslator({ locale: 'fr', messages: fr })

const a = (id: string, s: AssigneeRow['submissionStatus']): AssigneeRow =>
  ({ assignmentId: `as-${id}`, studentId: id, studentName: `Élève ${id}`, submissionStatus: s })

const base: Omit<TemplateVM, 'kind' | 'status' | 'assignees'> = {
  id: 't1', audience: 'all', name: 'Passeport', description: null,
  // realistic timestamptz, not date-only (Phase-2 lesson)
  deadline: '2026-10-10T00:00:00+00:00',
  standard_key: 'passeport', condition_label: null, template_file_path: null, external_url: null, fields: [],
}
const vm = (over: Partial<TemplateVM>): TemplateVM =>
  ({ ...base, kind: 'doc', status: 'active', assignees: [], ...over })

describe('pills', () => {
  it('type pills', () => {
    expect(typePill('pdf', t)).toEqual({ kind: 'neutral', label: 'PDF · à signer' })
    expect(typePill('online', t)).toEqual({ kind: 'info', label: 'Formulaire en ligne' })
  })
  it('status pills', () => {
    expect(statusPill('active', t)).toEqual({ kind: 'ok', label: 'Actif' })
    expect(statusPill('draft', t)).toEqual({ kind: 'warn', label: 'Brouillon' })
  })
  it('req pills', () => {
    expect(reqPill({ audience: 'all', condition_label: null }, t)).toEqual({ kind: 'info', label: 'Obligatoire' })
    expect(reqPill({ audience: 'conditional', condition_label: 'si parents divorcés' }, t)).toEqual({ kind: 'neutral', label: 'si parents divorcés' })
    expect(reqPill({ audience: 'conditional', condition_label: null }, t)).toEqual({ kind: 'neutral', label: 'selon situation' })
  })
})

describe('progress', () => {
  const assignees = [a('1', 'approved'), a('2', 'submitted'), a('3', 'draft'), a('4', null), a('5', 'rejected')]
  it('formDone counts submitted+approved; docDone only approved', () => {
    expect(formDone(assignees)).toBe(2)
    expect(docDone(assignees)).toBe(1)
  })
  it('labels per kind and draft state', () => {
    expect(progressLabel(vm({ kind: 'online', assignees }), t)).toBe('2 / 5 reçus')
    expect(progressLabel(vm({ kind: 'doc', assignees }), t)).toBe('1 / 5 fourni')
    expect(progressLabel(vm({ kind: 'doc', assignees: [a('1', 'approved'), a('2', 'approved')] }), t)).toBe('2 / 2 fournis')
    expect(progressLabel(vm({ kind: 'online', status: 'draft', assignees: [] }), t)).toBe('Pas encore envoyé')
    expect(progressLabel(vm({ kind: 'doc', status: 'draft', assignees: [] }), t)).toBe('Pas encore demandé')
  })
  it('pct rounds and survives zero totals', () => {
    expect(progressPct(vm({ kind: 'doc', assignees }))).toBe(20)
    expect(progressPct(vm({ kind: 'doc', assignees: [] }))).toBe(0)
  })
})

describe('doc attention pill', () => {
  it('priority: brouillon > manquants > à vérifier > complet', () => {
    expect(docAttentionPill(vm({ status: 'draft' }), t)).toEqual({ kind: 'warn', label: 'Brouillon' })
    expect(docAttentionPill(vm({ assignees: [a('1', null), a('2', 'rejected'), a('3', 'approved')] }), t))
      .toEqual({ kind: 'bad', label: '2 manquants' })
    expect(docAttentionPill(vm({ assignees: [a('1', null), a('2', 'approved')] }), t))
      .toEqual({ kind: 'bad', label: '1 manquant' })
    expect(docAttentionPill(vm({ assignees: [a('1', 'submitted'), a('2', 'approved')] }), t))
      .toEqual({ kind: 'info', label: '1 à vérifier' })
    expect(docAttentionPill(vm({ assignees: [a('1', 'approved')] }), t))
      .toEqual({ kind: 'ok', label: 'Complet' })
  })
})

describe('drawer rows', () => {
  it('folds approved into restCount, pills the others, flags review rows', () => {
    const { rows, restCount } = docDrawerRows([
      a('1', 'approved'), a('2', 'submitted'), a('3', 'draft'), a('4', null), a('5', 'rejected'),
    ], t)
    expect(restCount).toBe(1)
    expect(rows.map(r => r.pill.label)).toEqual(['À vérifier', 'En cours', 'Manquant', 'À refaire'])
    expect(rows[0].review).toBe(true)
    expect(rows[1].review).toBe(false)
    expect(rows[0].initials).toBe('É2')
  })
  it('studentPill returns null for approved', () => {
    expect(studentPill('approved', t)).toBeNull()
    expect(studentPill(null, t)).toEqual({ kind: 'bad', label: 'Manquant' })
    expect(studentPill('rejected', t)).toEqual({ kind: 'bad', label: 'À refaire' })
  })
})

describe('stats', () => {
  const forms = [
    vm({ kind: 'online', assignees: [a('1', 'approved'), a('2', null)] }),
    vm({ kind: 'pdf', status: 'draft', assignees: [] }),
  ]
  const docs = [
    vm({ kind: 'doc', assignees: [a('1', 'approved'), a('2', 'submitted')] }),
    vm({ kind: 'doc', status: 'draft', deadline: null, assignees: [] }),
  ]
  it('formsStats over active only', () => {
    expect(formsStats(forms)).toEqual({ activeCount: 1, done: 1, total: 2 })
  })
  it('docsStats: docCount all, sums over active', () => {
    expect(docsStats(docs)).toEqual({ docCount: 2, reviewCount: 1, done: 1, total: 2 })
  })
  it('earliestActiveDeadline ignores drafts and nulls', () => {
    expect(earliestActiveDeadline(docs)).toBe('2026-10-10T00:00:00+00:00')
    expect(earliestActiveDeadline([vm({ status: 'draft' })])).toBeNull()
  })
})

describe('initials', () => {
  it('two-word and single-word names', () => {
    expect(initials('Manon Girard')).toBe('MG')
    expect(initials('Manon')).toBe('M')
  })
})

describe('activationHints', () => {
  const base = { status: 'draft' as const, kind: 'doc' as const, deadline: '2026-10-10', template_file_path: null, fields: [] as string[] }
  it('is empty for an active template', () => {
    expect(activationHints({ ...base, status: 'active', deadline: null })).toEqual([])
  })
  it('is empty for a ready draft', () => {
    expect(activationHints(base)).toEqual([])
  })
  it('flags a missing deadline', () => {
    expect(activationHints({ ...base, deadline: null })).toEqual(['Ajoutez une échéance avant d’activer.'])
  })
  it('flags a missing PDF on pdf kind only', () => {
    expect(activationHints({ ...base, kind: 'pdf' })).toEqual(['Téléversez le PDF avant d’activer.'])
    expect(activationHints({ ...base, kind: 'doc' })).toEqual([])
  })
  it('flags missing questions on online kind and stacks with missing deadline', () => {
    expect(activationHints({ ...base, kind: 'online', deadline: null })).toEqual([
      'Ajoutez une échéance avant d’activer.',
      'Ajoutez au moins une question avant d’activer.',
    ])
    expect(activationHints({ ...base, kind: 'online', fields: ['Q1'] })).toEqual([])
  })
})
