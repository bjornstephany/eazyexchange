import { describe, it, expect, vi, beforeEach } from 'vitest'

let scenario: { exchange: any; profile: any; updated: any }

function builder(table: string) {
  const b: any = {
    _f: {} as Record<string, any>,
    select: () => b,
    eq: (c: string, v: any) => { b._f[c] = v; return b },
    update: (row: any) => {
      const u: any = { eq: () => u, then: (r: any) => r({ error: null }) }
      scenario.updated = { table, row }
      return u
    },
    async single() {
      if (table === 'users') return { data: scenario.profile, error: null }
      return { data: scenario.exchange, error: null }
    },
    async maybeSingle() {
      if (table === 'users') return { data: scenario.profile, error: null }
      return { data: scenario.exchange, error: null }
    },
  }
  return b
}
const client = {
  from: (t: string) => builder(t),
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

import { updateGoodNewsTemplate } from '../settings'

beforeEach(() => {
  scenario = {
    exchange: { id: 'ex-1', name: 'E', year: 2026, archived_at: null, school_a_id: 's-1', school_b_id: null, good_news_subject: null, good_news_body: null },
    profile: { id: 'user-1', school_id: 's-1', role: 'organizer', org_role: 'owner', email: 'o@x.fr', full_name: 'O' },
    updated: null,
  }
})

describe('updateGoodNewsTemplate', () => {
  it('saves trimmed subject/body for an in-scope exchange', async () => {
    const res = await updateGoodNewsTemplate('ex-1', '  Bonjour {{student_name}}  ', '  Corps  ')
    expect(res).toEqual({ ok: true })
    expect(scenario.updated.table).toBe('exchanges')
    expect(scenario.updated.row.good_news_subject).toBe('Bonjour {{student_name}}')
    expect(scenario.updated.row.good_news_body).toBe('Corps')
  })
  it('returns a structured error (no throw) on empty subject', async () => {
    const res = await updateGoodNewsTemplate('ex-1', '   ', 'Corps')
    expect(res.ok).toBe(false)
  })
  it('returns a structured error on empty body', async () => {
    const res = await updateGoodNewsTemplate('ex-1', 'Sujet', '')
    expect(res.ok).toBe(false)
  })
  it('rejects an out-of-scope exchange', async () => {
    scenario.exchange.school_a_id = 'other'
    await expect(updateGoodNewsTemplate('ex-1', 'Sujet', 'Corps')).rejects.toBeTruthy()
  })
})
