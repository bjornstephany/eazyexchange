import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { userId: string; role: 'organizer' | 'student'; profileSchool: string; exchangeSchoolA: string }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: async () => ({ data: [{ position: 0 }], error: null }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'card-1', title: 'T', body: '', position: 0, created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-20T09:00:00.000Z' }, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'card-1', title: 'T', body: '', position: 0, created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-20T09:00:00.000Z' }, error: null }) }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        maybeSingle: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          if (table === 'exchanges') return { data: { school_a_id: scenario.exchangeSchoolA, school_b_id: null, archived_at: null }, error: null }
          if (table === 'exchange_info_cards') return { data: { exchange_id: 'ex-1' }, error: null }
          return { data: null, error: null }
        },
        single: async () => ({ data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }),
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => ({ id: scenario.userId }),
  getProfile: async () => ({ school_id: scenario.profileSchool, role: scenario.role }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addInfoCard } from '../exchanges'

describe('exchange info-card actions', () => {
  beforeEach(() => {
    scenario = { userId: 'u1', role: 'organizer', profileSchool: 'school-1', exchangeSchoolA: 'school-1' }
  })

  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(addInfoCard('ex-1', { title: 'T', body: '' })).rejects.toThrow('Unauthorized')
  })

  it('rejects an organizer from another school', async () => {
    scenario.exchangeSchoolA = 'school-2'
    await expect(addInfoCard('ex-1', { title: 'T', body: '' })).rejects.toThrow('Unauthorized')
  })

  it('returns a validation error code for a blank title (no throw)', async () => {
    await expect(addInfoCard('ex-1', { title: '   ', body: '' }))
      .resolves.toEqual({ ok: false, error: 'titleRequired' })
  })

  it('creates the card for the owning organizer', async () => {
    await expect(addInfoCard('ex-1', { title: 'T', body: '' }))
      .resolves.toEqual({ ok: true, card: {
        id: 'card-1', title: 'T', body: '', position: 0,
        createdAt: '2026-07-20T09:00:00.000Z', updatedAt: '2026-07-20T09:00:00.000Z',
      } })
  })
})
