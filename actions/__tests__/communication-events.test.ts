import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { userId: string; role: 'organizer' | 'student'; profileSchool: string; exchangeSchoolA: string }
let events: any[] = []

const CARD_ROW = {
  id: 'card-1', title: 'Point de rendez-vous', body: 'Gare', position: 0,
  created_at: '2026-07-20T09:00:00.000Z', updated_at: '2026-07-22T09:00:00.000Z',
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: async () => ({ data: [{ position: 0 }], error: null }),
        insert: (row: any) => {
          if (table === 'communication_events') { events.push(row); return Promise.resolve({ error: null }) }
          return { select: () => ({ single: async () => ({ data: CARD_ROW, error: null }) }) }
        },
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: CARD_ROW, error: null }) }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        maybeSingle: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role }, error: null }
          if (table === 'exchanges') return { data: { school_a_id: scenario.exchangeSchoolA, school_b_id: null, archived_at: null }, error: null }
          if (table === 'exchange_info_cards') return { data: { exchange_id: 'ex-1', title: 'Point de rendez-vous' }, error: null }
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

import { addInfoCard, updateInfoCard, deleteInfoCard } from '../exchanges'

beforeEach(() => {
  events = []
  scenario = { userId: 'u1', role: 'organizer', profileSchool: 'school-1', exchangeSchoolA: 'school-1' }
})

describe('info-card actions record communication events', () => {
  it('addInfoCard appends info_published with the title', async () => {
    await addInfoCard('ex-1', { title: 'Point de rendez-vous', body: 'Gare' })
    expect(events).toEqual([{
      exchange_id: 'ex-1', actor_id: 'u1', application_id: null,
      kind: 'info_published', subject: 'Point de rendez-vous', status: 'ok',
    }])
  })

  it('updateInfoCard appends info_updated with the NEW title', async () => {
    await updateInfoCard('card-1', { title: 'Nouveau titre', body: '' })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'info_updated', subject: 'Nouveau titre' })
  })

  it('deleteInfoCard appends info_deleted with the title read BEFORE the delete', async () => {
    await deleteInfoCard('card-1')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'info_deleted', subject: 'Point de rendez-vous' })
  })

  it('a rejected validation records nothing', async () => {
    await addInfoCard('ex-1', { title: '   ', body: '' })
    expect(events).toHaveLength(0)
  })

  it('addInfoCard returns the card timestamps the Infos status line needs', async () => {
    const r = await addInfoCard('ex-1', { title: 'Point de rendez-vous', body: 'Gare' })
    expect(r).toEqual({ ok: true, card: {
      id: 'card-1', title: 'Point de rendez-vous', body: 'Gare', position: 0,
      createdAt: '2026-07-20T09:00:00.000Z', updatedAt: '2026-07-22T09:00:00.000Z',
    } })
  })
})
