import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  role: 'organizer' | 'student'
  profileSchool: string
  exchangeSchools: { a: string; b: string | null } | null
  upsertError: { message: string } | null
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        upsert: async () => ({ error: scenario.upsertError }),
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role, org_role: 'owner' }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (table === 'exchanges') {
            if (!scenario.exchangeSchools) return { data: null, error: null }
            return { data: { id: 'ex-1', school_a_id: scenario.exchangeSchools.a, school_b_id: scenario.exchangeSchools.b }, error: null }
          }
          if (table === 'exchange_program_details') return { data: null, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveProgramDetails, getProgramDetails } from '../fillable'

const validInput = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'],
  association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School', proviseur_name: 'Mme MIRON HUGHES',
  sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
}

describe('program details actions', () => {
  beforeEach(() => {
    scenario = {
      userId: 'u1', role: 'organizer', profileSchool: 'school-1',
      exchangeSchools: { a: 'school-1', b: null }, upsertError: null,
    }
  })

  it('rejects a student caller', async () => {
    scenario.role = 'student'
    await expect(saveProgramDetails('ex-1', validInput)).rejects.toThrow('Unauthorized')
  })

  it('rejects an organizer from a non-participating school', async () => {
    scenario.exchangeSchools = { a: 'school-2', b: 'school-3' }
    await expect(saveProgramDetails('ex-1', validInput)).rejects.toThrow('Unauthorized')
  })

  it('accepts either side of the exchange', async () => {
    scenario.exchangeSchools = { a: 'school-9', b: 'school-1' }
    expect(await saveProgramDetails('ex-1', validInput)).toEqual({ ok: true })
  })

  it('saves valid input', async () => {
    expect(await saveProgramDetails('ex-1', validInput)).toEqual({ ok: true })
  })

  it('rejects retour before départ as a structured message', async () => {
    const r = await saveProgramDetails('ex-1', { ...validInput, travel_start: '2026-11-02', travel_end: '2026-10-17' })
    expect(r.ok).toBe(false)
  })

  it('rejects an overlong field as a structured message', async () => {
    const r = await saveProgramDetails('ex-1', { ...validInput, destination: 'x'.repeat(300) })
    expect(r.ok).toBe(false)
  })

  it('surfaces an upsert failure as a structured message', async () => {
    scenario.upsertError = { message: 'boom' }
    const r = await saveProgramDetails('ex-1', validInput)
    expect(r.ok).toBe(false)
  })

  it('getProgramDetails also enforces the scope check', async () => {
    scenario.exchangeSchools = { a: 'school-2', b: null }
    await expect(getProgramDetails('ex-1')).rejects.toThrow('Unauthorized')
  })
})
