import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EMPTY_FIRST_EXCHANGE_DETAILS, DETAILS_REQUIRED_MESSAGE } from '@/lib/onboarding/first-exchange'

let scenario: {
  orgRole: 'owner' | 'admin'
  school: { subscription_status: string | null; plan: string | null; grace_until: string | null }
  exchangeCount: number
}

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: async () => ({
    user: { id: 'u1' },
    profile: { school_id: 's1', org_role: scenario.orgRole, email: 'a@b.c', full_name: 'A' },
  }),
}))

// Capture what got written.
const inserted: { exchanges: any[]; cards: any[]; details: any[] } = { exchanges: [], cards: [], details: [] }
const cookieSet = vi.fn()

function exchangesTable() {
  const b: any = {
    select: () => b,
    eq: () => b,
    // count query (head:true) is awaited directly:
    then: (resolve: (v: unknown) => unknown) => resolve({ count: scenario.exchangeCount, error: null }),
    // insert(...).select('id').single()
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
  return {
    insert: async (rows: any[]) => { inserted.cards.push(...rows); return { error: null } },
  }
}
function detailsTable() {
  return {
    upsert: async (row: any) => { inserted.details.push(row); return { error: null } },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return exchangesTable()
      if (t === 'schools') return schoolsTable()
      if (t === 'exchange_info_cards') return cardsTable()
      if (t === 'exchange_program_details') return detailsTable()
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
  sending_school_name: 'Lycée Georges Duby',
}

beforeEach(() => {
  inserted.exchanges = []
  inserted.cards = []
  inserted.details = []
  cookieSet.mockClear()
  scenario = {
    orgRole: 'owner',
    school: { subscription_status: null, plan: null, grace_until: null }, // trial
    exchangeCount: 0,
  }
})

describe('completeFirstExchange', () => {
  it('creates the exchange, inserts the generated + filled cards, and sets the active cookie', async () => {
    const res = await completeFirstExchange('  Espagne 2026  ', details, [
      { title: 'Hébergement', body: '  En famille ' },
      { title: 'Contact organisateur', body: '' },
      { title: 'À prévoir', body: 'Mme Dupont' },
    ])
    expect(res).toEqual({ ok: true })
    expect(inserted.exchanges).toEqual([
      { name: 'Espagne 2026', year: new Date().getFullYear(), school_a_id: 's1', school_b_id: null, apply_slug: 'slug-espagne-2026' },
    ])
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Destination', body: 'le Minnesota, USA', position: 0 },
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.', position: 1 },
      { exchange_id: 'ex-new', title: 'Hébergement', body: 'En famille', position: 2 },
      { exchange_id: 'ex-new', title: 'À prévoir', body: 'Mme Dupont', position: 3 },
    ])
    expect(cookieSet).toHaveBeenCalledWith('ee_active_exchange', 'ex-new', expect.objectContaining({ path: '/' }))
  })

  it('rejects an empty name without creating anything', async () => {
    const res = await completeFirstExchange('   ', details, [{ title: 'Hébergement', body: 'x' }])
    expect(res).toEqual({ ok: false, error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a filled card whose title was cleared', async () => {
    const res = await completeFirstExchange('Espagne', details, [{ title: '   ', body: 'Some info' }])
    expect(res).toEqual({ ok: false, error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('returns the limit outcome at the plan cap', async () => {
    scenario.exchangeCount = 1 // trial cap = 1
    const res = await completeFirstExchange('Espagne', details, [{ title: 'Hébergement', body: 'x' }])
    expect(res).toEqual({ ok: false, error: 'limit', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing the destination', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, destination: '' }, [])
    expect(res).toEqual({ ok: false, error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a submission missing a travel date', async () => {
    const res = await completeFirstExchange('Échange X', { ...details, travel_end: '' }, [])
    expect(res).toEqual({ ok: false, error: 'invalid', message: DETAILS_REQUIRED_MESSAGE })
  })

  it('writes exchange_program_details for the new exchange', async () => {
    await completeFirstExchange('Échange X', details, [])
    expect(inserted.details[0]).toMatchObject({
      exchange_id: 'ex-new', destination: 'le Minnesota, USA',
      travel_start: '2026-10-17', travel_end: '2026-11-02',
      sending_school_name: 'Lycée Georges Duby', chaperones: [], absence_dates: [],
    })
  })

  it('generates the Destination and Dates clés cards ahead of the free ones', async () => {
    await completeFirstExchange('Échange X', details, [{ title: 'Hébergement', body: 'En famille' }])
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Destination', body: 'le Minnesota, USA', position: 0 },
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Le voyage se déroulera du 17 octobre au 2 novembre 2026.', position: 1 },
      { exchange_id: 'ex-new', title: 'Hébergement', body: 'En famille', position: 2 },
    ])
  })

  it('succeeds with no free-text cards at all', async () => {
    await expect(completeFirstExchange('Échange X', details, [])).resolves.toEqual({ ok: true })
  })
})
