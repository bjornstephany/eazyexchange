import { describe, it, expect } from 'vitest'
import { reorderIds, sortExchanges } from '@/lib/shell/exchange-order'

const ex = (id: string) => ({ id, name: id.toUpperCase() })

describe('sortExchanges', () => {
  it('returns the exchanges untouched when the order is empty', () => {
    const list = [ex('a'), ex('b'), ex('c')]
    expect(sortExchanges(list, []).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty array when there are no exchanges', () => {
    expect(sortExchanges([], ['a', 'b'])).toEqual([])
  })

  it('orders fully-listed exchanges exactly as the order array does', () => {
    const list = [ex('a'), ex('b'), ex('c')]
    expect(sortExchanges(list, ['c', 'a', 'b']).map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })

  it('puts unlisted exchanges first, keeping their incoming sequence', () => {
    // 'd' and 'e' arrive created_at desc and are not in the saved order:
    // a freshly created exchange must stay where the organizer expects it.
    const list = [ex('e'), ex('d'), ex('a'), ex('b')]
    expect(sortExchanges(list, ['b', 'a']).map((e) => e.id)).toEqual(['e', 'd', 'b', 'a'])
  })

  it('ignores order ids that match no exchange', () => {
    const list = [ex('a'), ex('b')]
    expect(sortExchanges(list, ['deleted', 'b', 'gone', 'a']).map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('honours the first occurrence of a duplicated id in the order', () => {
    const list = [ex('a'), ex('b')]
    expect(sortExchanges(list, ['b', 'a', 'b']).map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('does not mutate its inputs', () => {
    const list = [ex('a'), ex('b')]
    const order = ['b', 'a']
    sortExchanges(list, order)
    expect(list.map((e) => e.id)).toEqual(['a', 'b'])
    expect(order).toEqual(['b', 'a'])
  })
})

describe('reorderIds', () => {
  it('moves an id downwards to the target index', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  })

  it('moves an id upwards to the target index', () => {
    expect(reorderIds(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('swaps neighbours', () => {
    expect(reorderIds(['a', 'b', 'c'], 'a', 'b')).toEqual(['b', 'a', 'c'])
  })

  it('returns the same reference when the row is dropped on itself', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderIds(ids, 'b', 'b')).toBe(ids)
  })

  it('returns the same reference when either id is unknown', () => {
    const ids = ['a', 'b', 'c']
    expect(reorderIds(ids, 'zz', 'b')).toBe(ids)
    expect(reorderIds(ids, 'a', 'zz')).toBe(ids)
  })

  it('does not mutate its input', () => {
    const ids = ['a', 'b', 'c']
    reorderIds(ids, 'a', 'c')
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
