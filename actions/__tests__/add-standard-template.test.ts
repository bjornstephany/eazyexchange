import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  role: 'organizer' | 'student'
  archived: boolean
  dupInsert: boolean
  details: Record<string, unknown> | null
}
let inserted: { templates: any[]; slots: any[]; fields: any[] }
let updates: Record<string, unknown>[]
let upserted: Record<string, unknown>[]
let uploads: { path: string; bytes: number }[]

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    storage: {
      from: () => ({
        upload: async (path: string, body: Blob) => {
          uploads.push({ path, bytes: body.size })
          return { error: null }
        },
      }),
    },
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({
            single: async () => ({ data: { school_id: 's1', role: scenario.role }, error: null }),
            // activateTemplateRecord's conditional branch (unused here)
            in: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }),
          }) }),
        }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { archived_at: scenario.archived ? '2026-01-01T00:00:00Z' : null },
        }) }) }) }
      }
      if (table === 'exchange_program_details') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: scenario.details }) }) }),
          upsert: async (row: Record<string, unknown>) => {
            upserted.push(row)
            // Persist so the activation gate's own re-read (activateTemplateRecord)
            // sees the just-written details, same as a real DB round-trip.
            scenario.details = row as Record<string, unknown>
            return { error: null }
          },
        }
      }
      if (table === 'form_templates') {
        return {
          insert: (row: any) => ({ select: () => ({ single: async () => {
            if (scenario.dupInsert) return { data: null, error: { code: '23505', message: 'duplicate' } }
            inserted.templates.push(row)
            return { data: { id: 'tpl-new' }, error: null }
          } }) }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); return { error: null } } }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: {
              id: 'tpl-new', exchange_id: 'ex1', school_id: 's1',
              name: 'X', kind: inserted.templates[0]?.kind ?? 'doc', status: 'draft',
              audience: 'all', deadline: inserted.templates[0]?.deadline ?? null,
              standard_key: inserted.templates[0]?.standard_key ?? null,
              template_file_path: updates.find(u => 'template_file_path' in u)?.template_file_path ?? null,
              form_fields: [],
            },
          }) }) }),
        }
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

const fullDetails = {
  destination: 'le Minnesota', travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'], association_name: 'AGESSIA',
  sending_school_name: 'Lycée', receiving_school_name: 'Edina',
  proviseur_name: 'Mme X', sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

beforeEach(() => {
  scenario = { role: 'organizer', archived: false, dupInsert: false, details: fullDetails }
  inserted = { templates: [], slots: [], fields: [] }
  updates = []
  upserted = []
  uploads = []
  revalidatePath.mockClear()
})

const DL = { deadline: '2026-09-30' }

describe('addStandardTemplate', () => {
  it('rejects a student caller', async () => {
    scenario.role = 'student'
    await expect(addStandardTemplate('ex1', 'medical', DL)).rejects.toThrow('Unauthorized')
  })

  it('rejects an archived exchange', async () => {
    scenario.archived = true
    await expect(addStandardTemplate('ex1', 'medical', DL)).rejects.toThrow('Programme archivé — lecture seule.')
  })

  it('returns a structured error for an unknown key (never throws)', async () => {
    const res = await addStandardTemplate('ex1', 'nope', DL)
    expect(res).toEqual({ ok: false, message: 'Modèle standard inconnu.' })
    expect(inserted.templates).toHaveLength(0)
  })

  it('refuses a missing deadline as a structured outcome', async () => {
    const res = await addStandardTemplate('ex1', 'medical', { deadline: '  ' })
    expect(res).toEqual({ ok: false, message: 'Ajoutez une date limite avant d’activer.' })
    expect(inserted.templates).toHaveLength(0)
  })

  it('returns a friendly duplicate message on the unique-index violation', async () => {
    scenario.dupInsert = true
    const res = await addStandardTemplate('ex1', 'medical', DL)
    expect(res).toEqual({ ok: false, message: 'Ce modèle est déjà ajouté à cet échange.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('adds a doc entry ACTIVE with its deadline in one call', async () => {
    const res = await addStandardTemplate('ex1', 'passeport', DL)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(inserted.templates[0]).toMatchObject({
      exchange_id: 'ex1', school_id: 's1', standard_key: 'passeport',
      kind: 'doc', status: 'draft', deadline: '2026-09-30', created_by: 'u1',
    })
    expect(updates).toContainEqual({ status: 'active' })
    expect(inserted.slots).toHaveLength(1)
    expect(revalidatePath).toHaveBeenCalledWith('/forms', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('adds a fillable ACTIVE when program details are already complete', async () => {
    const res = await addStandardTemplate('ex1', 'medical', DL)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(updates).toContainEqual({ status: 'active' })
    expect(upserted).toHaveLength(0)
  })

  it('writes the supplied details, then activates, on an exchange with none', async () => {
    scenario.details = null
    const res = await addStandardTemplate('ex1', 'famille', {
      deadline: '2026-09-30',
      details: { association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby' },
    })
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(upserted[0]).toMatchObject({
      exchange_id: 'ex1', association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby',
    })
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('leaves the template draft (not deleted) when details are still incomplete', async () => {
    scenario.details = null
    const res = await addStandardTemplate('ex1', 'famille', { deadline: '2026-09-30' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain('Nom de l’association')
    expect(updates).not.toContainEqual({ status: 'active' })
  })

  it('uploads the bundled CERFA for the AST and stores its path', async () => {
    const res = await addStandardTemplate('ex1', 'ast', DL)
    expect(res).toEqual({ ok: true, id: 'tpl-new' })
    expect(uploads).toHaveLength(1)
    expect(uploads[0].path).toBe('s1/tpl-new.pdf')
    expect(uploads[0].bytes).toBeGreaterThan(1000)
    expect(updates).toContainEqual({ template_file_path: 's1/tpl-new.pdf' })
    expect(updates).toContainEqual({ status: 'active' })
  })
})
