import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import { previewMode, cardCountLabel } from '@/lib/forms/card'
import type { TemplateVM, AssigneeRow } from '@/lib/forms/rollup'

const t = createTranslator({ locale: 'fr', messages: fr })

const a = (id: string, s: AssigneeRow['submissionStatus']): AssigneeRow =>
  ({ assignmentId: `as-${id}`, studentId: id, studentName: `Élève ${id}`, submissionStatus: s })

const vm = (over: Partial<TemplateVM>): TemplateVM => ({
  id: 't1', kind: 'pdf', status: 'active', audience: 'all', name: 'Autorisation',
  description: null, deadline: '2026-10-10T00:00:00+00:00', standard_key: null,
  condition_label: null, template_file_path: 's1/t1.pdf', external_url: null,
  fields: [], assignees: [], ...over,
})

describe('previewMode', () => {
  it('pdf with a file renders the real thumbnail', () => {
    expect(previewMode(vm({}))).toBe('pdf-file')
  })
  it('pdf draft without file shows the attach placeholder', () => {
    expect(previewMode(vm({ status: 'draft', template_file_path: null }))).toBe('pdf-missing')
  })
  it('online renders the paper mini-page regardless of status', () => {
    expect(previewMode(vm({ kind: 'online', template_file_path: null }))).toBe('online-paper')
    expect(previewMode(vm({ kind: 'online', status: 'draft', template_file_path: null }))).toBe('online-paper')
  })
  it('fillable renders its own document mini-page, not the online field paper', () => {
    expect(previewMode(vm({ kind: 'fillable', template_file_path: null }))).toBe('fillable-paper')
    expect(previewMode(vm({ kind: 'fillable', status: 'draft', template_file_path: null }))).toBe('fillable-paper')
  })
  it('doc shows the cartoon sticker', () => {
    expect(previewMode(vm({ kind: 'doc', template_file_path: null }))).toBe('doc-sticker')
  })
})

describe('cardCountLabel', () => {
  it('is an em dash for drafts', () => {
    expect(cardCountLabel(vm({ status: 'draft' }), t)).toBe('—')
  })
  it('uses the existing received/provided rollups for active templates', () => {
    const assignees = [a('1', 'approved'), a('2', 'submitted'), a('3', null)]
    expect(cardCountLabel(vm({ assignees }), t)).toBe('2 / 3 reçus')
    expect(cardCountLabel(vm({ kind: 'doc', assignees }), t)).toBe('1 / 3 fourni')
  })
})
