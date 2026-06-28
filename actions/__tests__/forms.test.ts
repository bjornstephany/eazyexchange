import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  role: 'organizer' | 'student'
  profileSchool: string
  templateSchool: string
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        insert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          if (table === 'form_fields') return { data: { order: 0 }, error: null }
          if (table === 'document_slots') return { data: { order: 0 }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'form_templates') return { data: { school_id: scenario.templateSchool }, error: null }
          if (table === 'form_fields') return { data: { template_id: 'tmpl-1' }, error: null }
          if (table === 'document_slots') return { data: { template_id: 'tmpl-1' }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addField, removeField } from '../forms'

describe('forms.ts authorization', () => {
  beforeEach(() => {
    scenario = { userId: 'u1', role: 'organizer', profileSchool: 'school-1', templateSchool: 'school-1' }
  })

  it('rejects addField from a student', async () => {
    scenario.role = 'student'
    await expect(addField('tmpl-1', 'L', 'text', true)).rejects.toThrow('Unauthorized')
  })

  it('rejects addField for an organizer from another school', async () => {
    scenario.templateSchool = 'school-2'
    await expect(addField('tmpl-1', 'L', 'text', true)).rejects.toThrow('Unauthorized')
  })

  it('allows addField for the owning organizer', async () => {
    await expect(addField('tmpl-1', 'L', 'text', true)).resolves.toBeUndefined()
  })

  it('rejects removeField from a student', async () => {
    scenario.role = 'student'
    await expect(removeField('field-1')).rejects.toThrow('Unauthorized')
  })
})
