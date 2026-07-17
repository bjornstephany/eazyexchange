import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  role: 'organizer' | 'student'
  archived: boolean
  dupInsert: boolean
}
let inserted: { templates: any[]; slots: any[]; fields: any[] }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({
          data: { school_id: 's1', role: scenario.role }, error: null,
        }) }) }) }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { archived_at: scenario.archived ? '2026-01-01T00:00:00Z' : null },
        }) }) }) }
      }
      if (table === 'form_templates') {
        return { insert: (row: any) => ({ select: () => ({ single: async () => {
          if (scenario.dupInsert) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "form_templates_standard_key_unique"' } }
          }
          inserted.templates.push(row)
          return { data: { id: 'tpl-new' }, error: null }
        } }) }) }
      }
      if (table === 'document_slots') {
        return { insert: async (rows: any) => { inserted.slots.push(...[].concat(rows)); return { error: null } } }
      }
      if (table === 'form_fields') {
        return { insert: async (rows: any) => { inserted.fields.push(...[].concat(rows)); return { error: null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { addStandardTemplate } from '../forms'

beforeEach(() => {
  scenario = { role: 'organizer', archived: false, dupInsert: false }
  inserted = { templates: [], slots: [], fields: [] }
  revalidatePath.mockClear()
})

describe('addStandardTemplate', () => {
  it('rejects a student caller', async () => {
    scenario.role = 'student'
    await expect(addStandardTemplate('ex1', 'medical')).rejects.toThrow('Unauthorized')
  })

  it('rejects an archived exchange', async () => {
    scenario.archived = true
    await expect(addStandardTemplate('ex1', 'medical')).rejects.toThrow('Programme archivé — lecture seule.')
  })

  it('returns a structured error for an unknown key (never throws)', async () => {
    const res = await addStandardTemplate('ex1', 'nope')
    expect(res).toEqual({ ok: false, message: 'Modèle standard inconnu.' })
    expect(inserted.templates).toHaveLength(0)
  })

  it('returns a friendly duplicate message on the unique-index violation', async () => {
    scenario.dupInsert = true
    const res = await addStandardTemplate('ex1', 'medical')
    expect(res).toEqual({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('inserts medical as a draft with slot + 9 fields and revalidates /forms', async () => {
    const res = await addStandardTemplate('ex1', 'medical')
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(inserted.templates[0]).toMatchObject({
      exchange_id: 'ex1', school_id: 's1', standard_key: 'medical',
      kind: 'pdf', type: 'document_upload', status: 'draft', audience: 'all',
      deadline: null, created_by: 'u1',
    })
    expect(inserted.slots).toHaveLength(1)
    expect(inserted.slots[0]).toMatchObject({ template_id: 'tpl-new', label: 'Autorisation médicale', required: true, order: 0 })
    expect(inserted.fields).toHaveLength(9)
    expect(revalidatePath).toHaveBeenCalledWith('/forms', 'layout')
  })

  it('revalidates /documents for a doc-kind key', async () => {
    const res = await addStandardTemplate('ex1', 'passeport')
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(inserted.fields).toHaveLength(0)
    expect(revalidatePath).toHaveBeenCalledWith('/documents', 'layout')
  })
})
