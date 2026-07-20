import { describe, it, expect, vi, beforeEach } from 'vitest'

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
const inserted: { exchanges: any[]; cards: any[] } = { exchanges: [], cards: [] }
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === 'exchanges') return exchangesTable()
      if (t === 'schools') return schoolsTable()
      if (t === 'exchange_info_cards') return cardsTable()
      throw new Error('unexpected table ' + t)
    },
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/tokens', () => ({ applySlug: (s: string) => 'slug-' + s.trim().toLowerCase().replace(/\s+/g, '-') }))

import { completeFirstExchange } from '@/actions/onboarding'

beforeEach(() => {
  inserted.exchanges = []
  inserted.cards = []
  cookieSet.mockClear()
  scenario = {
    orgRole: 'owner',
    school: { subscription_status: null, plan: null, grace_until: null }, // trial
    exchangeCount: 0,
  }
})

describe('completeFirstExchange', () => {
  it('creates the exchange, inserts only filled cards, and sets the active cookie', async () => {
    const res = await completeFirstExchange('  Espagne 2026  ', [
      { title: 'Dates clés', body: '  Départ le 3 mai ' },
      { title: 'Destination', body: '' },
      { title: 'Contact', body: 'Mme Dupont' },
    ])
    expect(res).toEqual({ ok: true })
    expect(inserted.exchanges).toEqual([
      { name: 'Espagne 2026', year: new Date().getFullYear(), school_a_id: 's1', school_b_id: null, apply_slug: 'slug-espagne-2026' },
    ])
    expect(inserted.cards).toEqual([
      { exchange_id: 'ex-new', title: 'Dates clés', body: 'Départ le 3 mai', position: 0 },
      { exchange_id: 'ex-new', title: 'Contact', body: 'Mme Dupont', position: 1 },
    ])
    expect(cookieSet).toHaveBeenCalledWith('ee_active_exchange', 'ex-new', expect.objectContaining({ path: '/' }))
  })

  it('rejects an empty name without creating anything', async () => {
    const res = await completeFirstExchange('   ', [{ title: 'Dates', body: 'x' }])
    expect(res).toEqual({ ok: false, error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects when no card has a body', async () => {
    const res = await completeFirstExchange('Espagne', [
      { title: 'Dates', body: '' },
      { title: 'Destination', body: '   ' },
    ])
    expect(res).toEqual({ ok: false, error: 'noCards', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('rejects a filled card whose title was cleared', async () => {
    const res = await completeFirstExchange('Espagne', [{ title: '   ', body: 'Some info' }])
    expect(res).toEqual({ ok: false, error: 'invalid', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })

  it('returns the limit outcome at the plan cap', async () => {
    scenario.exchangeCount = 1 // trial cap = 1
    const res = await completeFirstExchange('Espagne', [{ title: 'Dates', body: 'x' }])
    expect(res).toEqual({ ok: false, error: 'limit', message: expect.any(String) })
    expect(inserted.exchanges).toHaveLength(0)
  })
})
