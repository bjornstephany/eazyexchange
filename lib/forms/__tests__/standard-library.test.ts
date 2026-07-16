import { describe, it, expect, vi } from 'vitest'
import { STANDARD_TEMPLATES, seedStandardTemplates } from '@/lib/forms/standard-library'

describe('STANDARD_TEMPLATES', () => {
  it('defines the 8 real-program items with unique keys', () => {
    expect(STANDARD_TEMPLATES).toHaveLength(8)
    const keys = STANDARD_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(8)
    expect(keys).toEqual([
      'medical', 'decharge', 'absence', 'famille', 'ast',
      'passeport', 'passeport-parent', 'esta',
    ])
  })
  it('has 5 pdf forms and 3 docs, all mandatory, none online', () => {
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'pdf').map(t => t.key))
      .toEqual(['medical', 'decharge', 'absence', 'famille', 'ast'])
    expect(STANDARD_TEMPLATES.filter(t => t.kind === 'doc').map(t => t.key))
      .toEqual(['passeport', 'passeport-parent', 'esta'])
    expect(STANDARD_TEMPLATES.every(t => t.audience === 'all' && t.condition_label === null)).toBe(true)
  })
  it('only esta carries an external_url', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'esta')?.external_url).toBe('https://esta.cbp.dhs.gov')
    expect(STANDARD_TEMPLATES.filter(t => t.external_url !== null)).toHaveLength(1)
  })
  it('keeps the medical and décharge checklists; other items are signature-only', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'medical')?.fields).toHaveLength(9)
    expect(STANDARD_TEMPLATES.find(t => t.key === 'decharge')?.fields).toHaveLength(6)
    for (const t of STANDARD_TEMPLATES) {
      if (!['medical', 'decharge'].includes(t.key)) expect(t.fields).toHaveLength(0)
      if (t.kind === 'doc') expect(t.fields).toHaveLength(0)
    }
  })
  it('the parent-passport description stresses the SAME parent as the AST signatory', () => {
    expect(STANDARD_TEMPLATES.find(t => t.key === 'passeport-parent')?.description).toMatch(/même parent/i)
  })
})

describe('seedStandardTemplates', () => {
  it('inserts 8 drafts, one slot each, fields for medical+decharge, external_url on esta', async () => {
    const templateInserts: any[] = []
    const slotInserts: any[] = []
    const fieldInserts: any[] = []
    let nextId = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'form_templates') {
          return { insert: (row: any) => ({ select: () => ({ single: async () => {
            templateInserts.push(row); return { data: { id: `t${nextId++}` }, error: null }
          } }) }) }
        }
        if (table === 'document_slots') {
          return { insert: async (rows: any) => { slotInserts.push(...[].concat(rows)); return { error: null } } }
        }
        // form_fields
        return { insert: async (rows: any) => { fieldInserts.push(...[].concat(rows)); return { error: null } } }
      }),
    }
    await seedStandardTemplates(supabase as any, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1' })
    expect(templateInserts).toHaveLength(8)
    expect(templateInserts.every(r =>
      r.status === 'draft' && r.exchange_id === 'ex1' && r.school_id === 's1'
      && r.created_by === 'u1' && r.deadline === null && r.type === 'document_upload'
    )).toBe(true)
    expect(templateInserts.find(r => r.standard_key === 'esta')?.external_url).toBe('https://esta.cbp.dhs.gov')
    expect(templateInserts.filter(r => r.external_url === null)).toHaveLength(7)
    expect(slotInserts).toHaveLength(8) // every pdf/doc template gets its slot
    expect(fieldInserts).toHaveLength(9 + 6) // medical + decharge checklists
  })
})
