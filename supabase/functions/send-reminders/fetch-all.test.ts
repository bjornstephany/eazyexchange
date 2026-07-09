import { describe, it, expect } from 'vitest'
import { fetchAllPages, PAGE_SIZE, type PageResult } from './fetch-all'

// Typed manual mock (avoids vi.fn generics — untyped mocks have broken tsc here
// before). Records the (from, to) bounds of every call and replays `pages` in order.
function pager(pages: PageResult<number>[]) {
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to])
    return pages[calls.length - 1] ?? { data: [], error: null }
  }
  return { fetchPage, calls }
}

describe('fetchAllPages', () => {
  it('returns a single short page and stops after one fetch', async () => {
    const { fetchPage, calls } = pager([{ data: [1, 2, 3], error: null }])
    const { rows, error } = await fetchAllPages(fetchPage, 5)
    expect(rows).toEqual([1, 2, 3])
    expect(error).toBeNull()
    expect(calls).toEqual([[0, 4]])
  })

  it('accumulates full pages in order until a short page', async () => {
    const { fetchPage, calls } = pager([
      { data: [1, 2], error: null },
      { data: [3, 4], error: null },
      { data: [5], error: null },
    ])
    const { rows, error } = await fetchAllPages(fetchPage, 2)
    expect(rows).toEqual([1, 2, 3, 4, 5])
    expect(error).toBeNull()
    expect(calls).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('handles a dataset that ends exactly on a page boundary (final empty page)', async () => {
    const { fetchPage, calls } = pager([
      { data: [1, 2], error: null },
      { data: [], error: null },
    ])
    const { rows, error } = await fetchAllPages(fetchPage, 2)
    expect(rows).toEqual([1, 2])
    expect(error).toBeNull()
    expect(calls.length).toBe(2)
  })

  it('aborts with the error and NO rows when any page fails (never a partial cohort)', async () => {
    const { fetchPage } = pager([
      { data: [1, 2], error: null },
      { data: null, error: { message: 'boom' } },
    ])
    const { rows, error } = await fetchAllPages(fetchPage, 2)
    expect(error).toEqual({ message: 'boom' })
    expect(rows).toEqual([])
  })

  it('treats null data as an empty page and defaults to PAGE_SIZE bounds', async () => {
    const { fetchPage, calls } = pager([{ data: null, error: null }])
    const { rows, error } = await fetchAllPages(fetchPage)
    expect(rows).toEqual([])
    expect(error).toBeNull()
    expect(calls).toEqual([[0, PAGE_SIZE - 1]])
  })
})
