import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { role: string; school: string; exchangeSchools: [string, string]; updated: any }

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      const b: any = {
        select: () => b, eq: () => b,
        update: (row: any) => { scenario.updated = row; return { eq: async () => ({ error: null }) } },
        single: async () => table === 'users'
          ? { data: { school_id: scenario.school, role: scenario.role } }
          : { data: null },
        maybeSingle: async () => table === 'exchanges'
          ? { data: { school_a_id: scenario.exchangeSchools[0], school_b_id: scenario.exchangeSchools[1] } }
          : { data: null },
      }
      return b
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setApplicationOpen } from '../exchanges'

beforeEach(() => { scenario = { role: 'organizer', school: 's-1', exchangeSchools: ['s-1', 's-2'], updated: null } })

describe('setApplicationOpen', () => {
  it('rejects a student', async () => {
    scenario.role = 'student'
    await expect(setApplicationOpen('ex-1', true, null)).rejects.toThrow('Unauthorized')
  })
  it('updates the flag for an in-scope organizer', async () => {
    await setApplicationOpen('ex-1', true, '2026-09-01')
    expect(scenario.updated).toEqual({ application_open: true, application_deadline: '2026-09-01' })
  })
})
