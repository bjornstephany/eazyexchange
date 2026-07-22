import { describe, it, expect, vi } from 'vitest'
import { STANDARD_TEMPLATES } from '@/lib/forms/standard-library'
import { insertStandardTemplate } from '@/lib/forms/insert-standard-template'

describe('insertStandardTemplate', () => {
  function harness() {
    const templateInserts: any[] = []
    const slotInserts: any[] = []
    const fieldInserts: any[] = []
    const templateUpdates: Record<string, unknown>[] = []
    const uploads: { path: string; bytes: number }[] = []
    const supabase = {
      storage: {
        from: () => ({
          upload: async (path: string, body: Blob) => {
            uploads.push({ path, bytes: body.size })
            return { error: null }
          },
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'form_templates') {
          return {
            insert: (row: any) => ({ select: () => ({ single: async () => {
              templateInserts.push(row); return { data: { id: 't1' }, error: null }
            } }) }),
            update: (patch: Record<string, unknown>) => ({ eq: async () => { templateUpdates.push(patch); return { error: null } } }),
          }
        }
        if (table === 'document_slots') {
          return { insert: async (rows: any) => { slotInserts.push(...[].concat(rows)); return { error: null } } }
        }
        return { insert: async (rows: any) => { fieldInserts.push(...[].concat(rows)); return { error: null } } }
      }),
    }
    return { supabase, templateInserts, slotInserts, fieldInserts, templateUpdates, uploads }
  }

  it('inserts a draft with no slot and no fields for medical (fillable)', async () => {
    const { supabase, templateInserts, slotInserts, fieldInserts } = harness()
    const std = STANDARD_TEMPLATES.find(t => t.key === 'medical')!
    const res = await insertStandardTemplate(supabase as any, std, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1', deadline: '2026-09-30' })
    expect(res).toEqual({ id: 't1' })
    expect(templateInserts[0]).toMatchObject({
      exchange_id: 'ex1', school_id: 's1', standard_key: 'medical', status: 'draft', deadline: '2026-09-30',
      kind: 'fillable', type: 'data_entry',
    })
    expect(slotInserts).toHaveLength(0)
    expect(fieldInserts).toHaveLength(0)
  })

  it('still inserts a slot for a pdf-kind item (ast), and uploads the bundled CERFA', async () => {
    const { supabase, slotInserts, uploads, templateUpdates } = harness()
    const std = STANDARD_TEMPLATES.find(t => t.key === 'ast')!
    await insertStandardTemplate(supabase as any, std, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1', deadline: '2026-09-30' })
    expect(slotInserts).toHaveLength(1)
    expect(uploads).toEqual([{ path: 's1/t1.pdf', bytes: expect.any(Number) }])
    expect(templateUpdates).toContainEqual({ template_file_path: 's1/t1.pdf' })
  })

  it('maps a 23505 insert error to { duplicate: true }', async () => {
    const supabase = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({
        data: null, error: { code: '23505', message: 'duplicate' },
      }) }) }) }),
    }
    const std = STANDARD_TEMPLATES.find(t => t.key === 'passeport')!
    const res = await insertStandardTemplate(supabase as any, std, { exchangeId: 'ex1', schoolId: 's1', userId: 'u1', deadline: '2026-09-30' })
    expect(res).toEqual({ duplicate: true })
  })
})
