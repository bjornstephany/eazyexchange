import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EMPTY_FIRST_EXCHANGE_DETAILS, DETAILS_REQUIRED_MESSAGE } from '@/lib/onboarding/first-exchange'

let scenario: {
  school: {
    name: string
    uai: string | null
    subscription_status: string | null
    plan: string | null
    grace_until: string | null
  }
  exchangeCount: number
  // Rows the registry returns for the school's UAI, in id order.
  registry: { name: string; commune: string }[]
}

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: 'owner', email: 'a@b.c', full_name: 'A' },
  }),
}))

const inserted: { exchanges: any[]; cards: any[]; details: any[] } = { exchanges: [], cards: [], details: [] }
const cookieSet = vi.fn()
const redirect = vi.fn((path: string) => { throw new Error('NEXT_REDIRECT:' + path) })
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirect(p) }))

function exchangesTable() {
  const b: any = {
    select: () => b,
    eq: () => b,
    then: (resolve: (v: unknown) => unknown) => resolve({ count: scenario.exchangeCount, error: null }),
    insert: (row: any) => {
      inserted.exchanges.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'ex-new' }, error: null }) }) }
    },
  }
  return b
}
function schoolsTable() {
  const b: any = {
    select: () => b, eq: () => b,
    single: async () => ({ data: scenario.school, error: null }),
  }
  return b
}
function cardsTable() {
  return { insert: async (rows: any[]) => { inserted.cards.push(...rows); return { error: null } } }
}
function detailsTable() {
  return { upsert: async (row: any) => { inserted.details.push(row); return { error: null } } }
}
// .select('commune').eq('uai', ...)[.eq('name', ...)].order('id').limit(1).maybeSingle()
function registryTable() {
  let nameFilter: string | null = null
  const b: any = {
    select: () => b,
    eq: (col: string, val: string) => { if (col === 'name') nameFilter = val; return b },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => {
      const rows = nameFilter === null
        ? scenario.registry
        : scenario.registry.filter(r => r.name === nameFilter)
      return { data: rows[0] ? { commune: rows[0].commune } : null, error: null }
    },
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return exchangesTable()
      if (t === 'schools') return schoolsTable()
      if (t === 'exchange_info_cards') return cardsTable()
      if (t === 'exchange_program_details') return detailsTable()
      if (t === 'school_registry') return registryTable()
      throw new Error('unexpected table ' + t)
    },
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/tokens', () => ({ applySlug: (s: string) => 'slug-' + s.trim().toLowerCase().replace(/\s+/g, '-') }))

import { completeFirstExchange } from '@/actions/onboarding'

const details = {
  ...EMPTY_FIRST_EXCHANGE_DETAILS,
  destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
}

beforeEach(() => {
  inserted.exchanges = []
  inserted.cards = []
  inserted.details = []
  cookieSet.mockClear()
  redirect.mockClear()
  scenario = {
    school: {
      name: 'Lycée Chevreul Lestonnac', uai: '0690574Z',
      subscription_status: null, plan: null, grace_until: null, // trial
    },
    exchangeCount: 0,
    registry: [{ name: 'Lycée Chevreul Lestonnac', commune: 'Lyon' }],
  }
})

describe('completeFirstExchange', () => {
  it('creates the exchange, sets the active cookie, and redirects to Applications', async () => {
    await expect(completeFirstExchange('  Espagne 2026  ', details))
      .rejects.toThrow('NEXT_REDIRECT:/applications')
    expect(inserted.exchanges).toEqual([
      { name: 'Espagne 2026', year: new Date().getFullYear(), school_a_id: 's1', school_b_id: null, apply_slug: 'slug-espagne-2026' },
    ])
    expect(cookieSet).toHaveBeenCalledWith('ee_active_exchange', 'ex-new', expect.objectContaining({ path: '/' }))
  })

  it('creates only the two generated cards', async () => {
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Destination', body: 'le Minnesota, USA', position: 0 },
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.', position: 1 },
    ])
  })

  it('derives sending_school_name from the school, never from the client', async () => {
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0]).toMatchObject({
      exchange_id: 'ex-new',
      destination: 'le Minnesota, USA',
      travel_start: '2026-10-17',
      travel_end: '2026-11-02',
      sending_school_name: 'Lycée Chevreul Lestonnac',
      chaperones: [], absence_dates: [],
    })
  })

  it('derives sending_city from the registry commune', async () => {
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBe('Lyon')
  })

  it('picks the campus matching the school name when a UAI is shared', async () => {
    scenario.registry = [
      { name: 'Lycée Chevreul Lestonnac — Site St Didier', commune: 'Saint-Didier-au-Mont-d’Or' },
      { name: 'Lycée Chevreul Lestonnac', commune: 'Lyon' },
    ]
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBe('Lyon')
  })

  it('falls back to the first registry row when the name no longer matches', async () => {
    scenario.registry = [{ name: 'Lycée Chevreul Lestonnac (renommé)', commune: 'Lyon' }]
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBe('Lyon')
  })

  it('leaves sending_city null for a school with no UAI', async () => {
    scenario.school.uai = null
    await expect(completeFirstExchange('Échange X', details)).rejects.toThrow('NEXT_REDIRECT')
    expect(inserted.details[0].sending_city).toBeNull()
  })

  it('rejects an empty name without creating anything or redirecting', async () => {
    const res = await completeFirstExchange('   ', details)
    expect(res).toEqual({ error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns the limit outcome at the plan cap', async () => {
    scenario.exchangeCount = 1 // trial cap = 1
    const res = await completeFirstExchange('Espagne', details)
    expect(res).toEqual({ error: 'limit', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing the destination', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, destination: '' })
    expect(res).toEqual({ error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing a travel date', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, travel_end: '' })
    expect(res).toEqual({ error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
  })
})
