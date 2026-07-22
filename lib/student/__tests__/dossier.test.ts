import { describe, it, expect, beforeAll } from 'vitest'
import { namespaceTranslator, type AppTranslator } from '@/lib/i18n/messages'
import {
  bucketStatus, buildDossier, deriveName, dossierSubline,
  type RawAssignment,
} from '@/lib/student/dossier'

function raw(
  id: string,
  status: RawAssignment['submissions'] extends unknown ? string | null : never,
  deadline: string | null,
  exchange = 'Espagne 2026',
  type: 'data_entry' | 'document_upload' = 'document_upload',
): RawAssignment {
  return {
    id,
    assigned_at: '2026-01-01',
    form_templates: { id: `t-${id}`, name: `Pièce ${id}`, type, deadline, exchanges: { name: exchange } },
    submissions: status === null
      ? null
      : [{ status: status as never, submitted_at: '2026-06-01', review_note: status === 'rejected' ? 'Illisible' : null }],
  }
}

const NOW = new Date('2026-07-01T00:00:00Z')

describe('bucketStatus', () => {
  it('buckets no-submission / draft / rejected as todo', () => {
    expect(bucketStatus(null)).toBe('todo')
    expect(bucketStatus('draft')).toBe('todo')
    expect(bucketStatus('rejected')).toBe('todo')
  })
  it('buckets submitted as review and approved as done', () => {
    expect(bucketStatus('submitted')).toBe('review')
    expect(bucketStatus('approved')).toBe('done')
  })
})

describe('buildDossier', () => {
  const d = buildDossier([
    raw('a', null, '2026-07-10'),        // todo
    raw('b', 'draft', '2026-07-05'),     // todo (soonest)
    raw('c', 'rejected', '2026-06-20'),  // todo + overdue
    raw('d', 'submitted', '2026-07-08'), // review
    raw('e', 'approved', '2026-07-02'),  // done (deadline ignored for next)
  ], NOW)

  it('counts each section and sentCount = total - todoCount', () => {
    expect(d.total).toBe(5)
    expect(d.todoCount).toBe(3)
    expect(d.reviewCount).toBe(1)
    expect(d.doneCount).toBe(1)
    expect(d.sentCount).toBe(2) // submitted + approved
  })
  it('computes pct from sentCount/total', () => {
    expect(d.pct).toBe(40)
  })
  it('picks the soonest deadline among non-approved (todo+review)', () => {
    expect(d.nextDeadline).toBe('2026-07-05')
  })
  it('marks a past-deadline non-approved item overdue', () => {
    expect(d.todo.find(i => i.id === 'c')!.overdue).toBe(true)
    expect(d.todo.find(i => i.id === 'a')!.overdue).toBe(false)
  })
  it('never marks an approved item overdue', () => {
    expect(d.done[0].overdue).toBe(false)
  })
  it('detects multi-exchange', () => {
    expect(d.multiExchange).toBe(false)
    expect(buildDossier([raw('a', null, null, 'X'), raw('b', null, null, 'Y')], NOW).multiExchange).toBe(true)
  })
  it('handles an empty dossier', () => {
    const e = buildDossier([], NOW)
    expect(e.total).toBe(0)
    expect(e.pct).toBe(0)
    expect(e.nextDeadline).toBeNull()
  })
})

describe('deriveName', () => {
  it('splits prénom and two-letter initials', () => {
    expect(deriveName('Léa Dubois')).toEqual({ firstName: 'Léa', initials: 'LD' })
  })
  it('falls back to the whole name when single-word', () => {
    expect(deriveName('Léa')).toEqual({ firstName: 'Léa', initials: 'L' })
  })
})

describe('dossierSubline', () => {
  let t: AppTranslator
  beforeAll(async () => { t = await namespaceTranslator('fr', 'student') })
  it('nudges toward remaining work with correct pluralization', () => {
    expect(dossierSubline(buildDossier([raw('a', null, '2026-07-10')], NOW), t)).toContain('1 chose')
    expect(dossierSubline(buildDossier([raw('a', null, '2026-07-10'), raw('b', null, '2026-07-11')], NOW), t)).toContain('2 choses')
  })
  it('confirms all sent when nothing is left to do but review pending', () => {
    expect(dossierSubline(buildDossier([raw('d', 'submitted', '2026-07-08')], NOW), t)).toContain('Tout est envoyé')
  })
  it('confirms complete when everything is approved', () => {
    expect(dossierSubline(buildDossier([raw('e', 'approved', null)], NOW), t)).toContain('toutes tes pièces sont validées')
  })
  it('has a gentle empty-dossier line', () => {
    expect(dossierSubline(buildDossier([], NOW), t)).toContain('Rien à remplir')
  })
  it('uses only typographic apostrophes (no ASCII) in every subline', () => {
    const lines = [
      dossierSubline(buildDossier([raw('a', null, '2026-07-10')], NOW), t),
      dossierSubline(buildDossier([raw('d', 'submitted', '2026-07-08')], NOW), t),
      dossierSubline(buildDossier([raw('e', 'approved', null)], NOW), t),
      dossierSubline(buildDossier([], NOW), t),
    ]
    for (const l of lines) expect(l).not.toMatch(/'/)
  })
})
