import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: {
  userId: string
  role: 'organizer' | 'student'
  profileSchool: string
  exchangeSchools: { a: string; b: string | null } | null
  upsertError: { message: string } | null
}

/** Rows handed to exchange_program_details.upsert, newest last. */
const upserted: any[] = []

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: scenario.userId } } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        upsert: async (row: any) => {
          if (table === 'exchange_program_details') upserted.push(row)
          return { error: scenario.upsertError }
        },
        single: async () => {
          if (table === 'users') return { data: { school_id: scenario.profileSchool, role: scenario.role, org_role: 'owner', status: 'approved' }, error: null }
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

import { saveProgramDetails, getProgramDetails, type ProgramDetailsInput } from '../fillable'
import { TRAVEL_ORDER_MESSAGE } from '@/lib/exchange/travel-dates'

const validInput: ProgramDetailsInput = {
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17', travel_end: '2026-11-02',
  chaperones: ['Polly STEPHANY'],
  association_name: 'AGESSIA', sending_school_name: 'Lycée Georges Duby',
  receiving_school_name: 'Edina High School', proviseur_name: 'Mme MIRON HUGHES',
  sending_city: 'Luynes', absence_dates: ['le jeudi 19 octobre 2026'],
  participation_cost: '850 € par élève',
  payment_details: 'https://helloasso.com/x',
  confirmation_deadline: '2026-09-15',
}

describe('program details actions', () => {
  beforeEach(() => {
    scenario = {
      userId: 'u1', role: 'organizer', profileSchool: 'school-1',
      exchangeSchools: { a: 'school-1', b: null }, upsertError: null,
    }
    upserted.length = 0
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

  it('rejects retour on the same day as départ as a structured message', async () => {
    const r = await saveProgramDetails('ex-1', { ...validInput, travel_end: '2026-10-17' })
    expect(r).toEqual({ ok: false, message: TRAVEL_ORDER_MESSAGE })
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

describe('saveProgramDetails — acceptance-email columns', () => {
  beforeEach(() => {
    scenario = {
      userId: 'u1', role: 'organizer', profileSchool: 'school-1',
      exchangeSchools: { a: 'school-1', b: null }, upsertError: null,
    }
    upserted.length = 0
  })

  it('writes all three new columns', async () => {
    const res = await saveProgramDetails('ex-1', validInput)
    expect(res).toEqual({ ok: true })
    expect(upserted[0]).toMatchObject({
      participation_cost: '850 € par élève',
      payment_details: 'https://helloasso.com/x',
      confirmation_deadline: '2026-09-15',
    })
  })

  it('stores a blank value as null rather than an empty string', async () => {
    await saveProgramDetails('ex-1', { ...validInput, participation_cost: '   ', confirmation_deadline: '' })
    expect(upserted[0]).toMatchObject({
      participation_cost: null,
      confirmation_deadline: null,
    })
  })

  it('rejects an overlong participation cost without writing', async () => {
    const res = await saveProgramDetails('ex-1', { ...validInput, participation_cost: 'x'.repeat(201) })
    expect(res).toEqual({ ok: false, message: expect.any(String) })
    expect(upserted).toHaveLength(0)
  })

  it('rejects an overlong payment detail without writing', async () => {
    const res = await saveProgramDetails('ex-1', { ...validInput, payment_details: 'y'.repeat(201) })
    expect(res).toEqual({ ok: false, message: expect.any(String) })
    expect(upserted).toHaveLength(0)
  })
})
