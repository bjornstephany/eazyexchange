import { describe, it, expect } from 'vitest'
import { shapeSubmissions, dayFactory } from '../lib/student-shape.mjs'

const IDS = ['t0', 't1', 't2', 't3', 't4', 't5']
const day = dayFactory(new Date('2026-07-28T00:00:00.000Z'))

describe('shapeSubmissions', () => {
  it('writes nothing for an untouched shape', () => {
    const out = shapeSubmissions([null, null, null, null, null, null], IDS, day)
    expect(out.submissions).toEqual([])
    expect(out.reviews).toEqual([])
  })

  it('inserts reviewed forms as submitted and queues the review separately', () => {
    const out = shapeSubmissions(['approved', null, null, null, null, null], IDS, day)
    expect(out.submissions).toEqual([
      { template_id: 't0', status: 'submitted', submitted_at: day(-6) },
    ])
    expect(out.reviews).toEqual([{ template_id: 't0', status: 'approved', at: day(-2) }])
  })

  it('leaves a draft unsubmitted and unreviewed', () => {
    const out = shapeSubmissions(['draft', null, null, null, null, null], IDS, day)
    expect(out.submissions).toEqual([{ template_id: 't0', status: 'draft', submitted_at: null }])
    expect(out.reviews).toEqual([])
  })

  it('spreads submitted_at and reviewed_at by template position', () => {
    const out = shapeSubmissions(['submitted', 'rejected', null, null, null, null], IDS, day)
    expect(out.submissions.map((s) => s.submitted_at)).toEqual([day(-6), day(-5)])
    expect(out.reviews).toEqual([{ template_id: 't1', status: 'rejected', at: day(-1) }])
  })

  it('is a pure function of its inputs — running it twice gives the same rows', () => {
    const shape = ['approved', 'submitted', 'draft', null, 'approved', null]
    expect(shapeSubmissions(shape, IDS, day)).toEqual(shapeSubmissions(shape, IDS, day))
  })
})
