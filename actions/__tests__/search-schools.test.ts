import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = {
  id: number; uai: string; name: string; type: string
  status: string | null; commune: string; postal_code: string
}

// Captured LIKE patterns, in call order, so we can assert the query shapes.
let patterns: string[]
let responses: Row[][]
let scenario: { user: { id: string } | null; role: string }

function row(id: number, name: string): Row {
  return { id, uai: `U${id}`, name, type: 'Lycée', status: 'Public', commune: 'Lyon', postal_code: '69007' }
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: scenario.user } }) },
    from(table: string) {
      if (table === 'users') {
        const u: any = {
          select: () => u, eq: () => u,
          single: async () => ({
            data: {
              id: 'u1', role: scenario.role, school_id: 's-1', full_name: 'x', status: 'approved',
              email: 'a@b.com', org_role: 'owner', locale: 'fr',
              schools: { name: '', country: 'FR' },
            },
          }),
        }
        return u
      }
      const b: any = {
        select: () => b,
        order: () => b,
        like: (_col: string, pattern: string) => { patterns.push(pattern); return b },
        limit: async () => ({ data: responses.shift() ?? [], error: null }),
      }
      return b
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))

import { searchSchools } from '@/actions/onboarding'

beforeEach(() => {
  patterns = []
  responses = []
  scenario = { user: { id: 'u1' }, role: 'organizer' }
})

describe('searchSchools', () => {
  it('returns nothing and hits no query below the two-character minimum', async () => {
    expect(await searchSchools('l')).toEqual([])
    expect(await searchSchools('  ')).toEqual([])
    expect(patterns).toEqual([])
  })

  it('normalizes the query and issues a prefix then a contains pattern', async () => {
    responses = [[row(1, 'Lycée Chevreul')], [row(2, 'Collège Chevreul')]]
    const out = await searchSchools('  Chevreul-Lestonnac ')
    expect(patterns).toEqual(['chevreul lestonnac%', '%chevreul lestonnac%'])
    expect(out.map(o => o.id)).toEqual([1, 2])
  })

  it('puts prefix hits first and de-duplicates across the two queries', async () => {
    responses = [[row(7, 'Lycée A')], [row(3, 'Collège B'), row(7, 'Lycée A')]]
    expect((await searchSchools('lycee')).map(o => o.id)).toEqual([7, 3])
  })

  it('caps the merged result at 8 rows', async () => {
    const many = Array.from({ length: 8 }, (_, i) => row(i + 1, `École ${i + 1}`))
    const more = Array.from({ length: 8 }, (_, i) => row(i + 100, `École ${i + 100}`))
    responses = [many, more]
    expect(await searchSchools('ecole')).toHaveLength(8)
  })

  it('never lets user input reach the pattern as a wildcard', async () => {
    responses = [[], []]
    await searchSchools('%_*')
    expect(patterns).toEqual([])   // normalizes to '', below the minimum
  })

  it('rejects a non-organizer caller', async () => {
    scenario.role = 'student'
    await expect(searchSchools('lycee')).rejects.toThrow('Unauthorized')
  })

  it('rejects an unauthenticated caller', async () => {
    scenario.user = null
    await expect(searchSchools('lycee')).rejects.toThrow('Unauthenticated')
  })
})
