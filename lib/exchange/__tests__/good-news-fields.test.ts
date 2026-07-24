import { describe, it, expect } from 'vitest'
import {
  missingGoodNewsFields, GOOD_NEWS_FIELD_LABELS, GOOD_NEWS_FIELD_ORDER,
  type GoodNewsValues,
} from '@/lib/exchange/good-news-fields'

const complete: GoodNewsValues = {
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
  participation_cost: '850 € par élève',
  payment_details: 'https://helloasso.com/x',
  confirmation_deadline: '2026-09-15',
}

describe('missingGoodNewsFields', () => {
  it('reports nothing missing when all four are present', () => {
    expect(missingGoodNewsFields(complete)).toEqual([])
  })

  it('reports every field when the row does not exist yet', () => {
    expect(missingGoodNewsFields(null)).toEqual([
      'travel_dates', 'participation_cost', 'payment_details', 'confirmation_deadline',
    ])
  })

  it('treats a half-filled travel period as a missing dates entry', () => {
    expect(missingGoodNewsFields({ ...complete, travel_end: null })).toEqual(['travel_dates'])
  })

  it('treats whitespace as blank', () => {
    expect(missingGoodNewsFields({ ...complete, participation_cost: '   ' }))
      .toEqual(['participation_cost'])
  })

  it('reports missing fields in the canonical order', () => {
    const missing = missingGoodNewsFields({
      ...complete, confirmation_deadline: null, participation_cost: null,
    })
    expect(missing).toEqual(['participation_cost', 'confirmation_deadline'])
  })

  it('labels every field it can report', () => {
    for (const field of GOOD_NEWS_FIELD_ORDER) {
      expect(GOOD_NEWS_FIELD_LABELS[field]).toBeTruthy()
    }
  })
})
