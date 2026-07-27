import { describe, it, expect, vi, beforeEach } from 'vitest'

let template: {
  status: 'draft' | 'active'
  deadline: string | null
  fieldCount: number
}
let updates: Record<string, unknown>[]

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: async () => ({
          data: { school_id: 's1', role: 'organizer', status: 'approved' }, error: null,
        }) }) }) }
      }
      if (table === 'exchanges') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { archived_at: null } }) }) }) }
      }
      if (table === 'form_fields') {
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => ({
            single: async () => ({ data: template.fieldCount > 0 ? { order: template.fieldCount - 1 } : null }),
          }) }) }) }),
          insert: async () => { template.fieldCount += 1; return { error: null } },
        }
      }
      if (table === 'form_templates') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: {
              id: 'tpl-1', exchange_id: 'ex-1', school_id: 's1', name: 'Q',
              kind: 'online', status: template.status, audience: 'all',
              deadline: template.deadline, standard_key: null, template_file_path: null,
              form_fields: Array.from({ length: template.fieldCount }, (_, i) => ({ id: `f${i}` })),
            },
          }) }) }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { updates.push(patch); return { error: null } } }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addField } from '../forms'

beforeEach(() => {
  template = { status: 'draft', deadline: '2026-09-30', fieldCount: 0 }
  updates = []
})

describe('addField auto-activation', () => {
  it('activates a draft online form once its first question is saved', async () => {
    await addField('tpl-1', 'Groupe sanguin', 'text', true)
    expect(updates).toContainEqual({ status: 'active' })
  })

  it('does not activate a draft with no deadline', async () => {
    template.deadline = null
    await addField('tpl-1', 'Groupe sanguin', 'text', true)
    expect(updates).not.toContainEqual({ status: 'active' })
  })

  it('is a no-op on an already active template', async () => {
    template.status = 'active'
    template.fieldCount = 2
    await addField('tpl-1', 'Autre', 'text', false)
    expect(updates).not.toContainEqual({ status: 'active' })
  })
})
