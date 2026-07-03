import { describe, it, expect, vi } from 'vitest'
import { STANDARD_TEMPLATES, seedStandardTemplates } from '@/lib/forms/standard-library'

describe('STANDARD_TEMPLATES', () => {
  it('defines the 10 standard items with unique keys', () => {
    expect(STANDARD_TEMPLATES).toHaveLength(10)
    const keys = STANDARD_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(10)
    expect(keys).toEqual(expect.arrayContaining([
      'sante', 'decharge', 'photo', 'accueil',
      'passeport', 'ast', 'idp1', 'idp2', 'livret', 'medical2',
    ]))
  })
  it('has 4 forms (3 pdf + 1 online with 8 questions) and 6 docs (2 conditional)', () => {
    const forms = STANDARD_TEMPLATES.filter(t => t.kind !== 'doc')
    const docs = STANDARD_TEMPLATES.filter(t => t.kind === 'doc')
    expect(forms).toHaveLength(4)
    expect(forms.filter(t => t.kind === 'pdf')).toHaveLength(3)
    expect(forms.find(t => t.key === 'accueil')?.fields).toHaveLength(8)
    expect(docs).toHaveLength(6)
    expect(docs.filter(t => t.audience === 'conditional').map(t => t.key).sort()).toEqual(['livret', 'medical2'])
    expect(docs.find(t => t.key === 'livret')?.condition_label).toBe('si parents divorcés')
  })
  it('conditional items are docs only and every pdf has a paper checklist', () => {
    for (const t of STANDARD_TEMPLATES) {
      if (t.audience === 'conditional') expect(t.kind).toBe('doc')
      if (t.kind === 'pdf') expect(t.fields.length).toBeGreaterThan(0)
      if (t.kind === 'doc') expect(t.fields).toHaveLength(0)
    }
  })
})

describe('seedStandardTemplates', () => {
  it('inserts 10 templates as drafts, slots for pdf/doc, fields for online+pdf', async () => {
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
    expect(templateInserts).toHaveLength(10)
    expect(templateInserts.every(r => r.status === 'draft' && r.exchange_id === 'ex1' && r.school_id === 's1' && r.created_by === 'u1')).toBe(true)
    expect(slotInserts).toHaveLength(9) // 3 pdf forms + 6 docs
    // 8 accueil questions + 9+6+5 pdf checklist labels
    expect(fieldInserts).toHaveLength(8 + 9 + 6 + 5)
  })
})
