import { describe, it, expect, vi, beforeEach } from 'vitest'

const like = vi.fn((_column: string, _pattern: string) => {})
const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

import { searchPublicSchools } from '../public-schools'

function stubRows(rows: unknown[]) {
  createClient.mockResolvedValue({
    from: () => ({ select: () => ({ like: (column: string, pattern: string) => {
      like(column, pattern)
      return { order: () => ({ limit: async () => ({ data: rows, error: null }) }) }
    } }) }),
  })
}

beforeEach(() => { like.mockClear(); createClient.mockReset() })

describe('searchPublicSchools', () => {
  it('returns nothing for a query shorter than the minimum', async () => {
    stubRows([])
    expect(await searchPublicSchools('a')).toEqual([])
    expect(like).not.toHaveBeenCalled()
  })

  it('normalizes accents and punctuation before querying', async () => {
    stubRows([])
    await searchPublicSchools('Saint-Ouen')
    expect(like).toHaveBeenCalledWith('search_name', 'saint ouen%')
  })

  it('cannot receive LIKE wildcards from user input', async () => {
    stubRows([])
    await searchPublicSchools('100%_test')
    expect(like).toHaveBeenCalledWith('search_name', '100 test%')
  })

  it('ranks prefix matches ahead of contains matches and dedupes', async () => {
    const a = { id: 1, uai: 'A', name: 'Alpha', type: 'LYC', status: null, commune: 'Lyon', postal_code: '69003' }
    const b = { id: 2, uai: 'B', name: 'Beta', type: 'LYC', status: null, commune: 'Lyon', postal_code: '69003' }
    createClient.mockResolvedValue({
      from: () => ({ select: () => ({ like: (col: string) => ({
        order: () => ({ limit: async () => ({ data: col === 'search_name' ? [a] : [b, a], error: null }) }),
      }) }) }),
    })
    const out = await searchPublicSchools('alp')
    expect(out.map((o) => o.id)).toEqual([1, 2])
  })
})
