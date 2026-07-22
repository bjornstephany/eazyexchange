import { describe, it, expect } from 'vitest'
import { targetDimensions, MAX_EDGE_PX } from '../image-compression'

describe('targetDimensions', () => {
  it('leaves small images untouched', () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 })
    expect(targetDimensions(MAX_EDGE_PX, MAX_EDGE_PX)).toEqual({ width: MAX_EDGE_PX, height: MAX_EDGE_PX })
  })
  it('scales a landscape image down to the max edge, preserving ratio', () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: 2000, height: 1500 })
  })
  it('scales a portrait image down to the max edge, preserving ratio', () => {
    expect(targetDimensions(3000, 4000)).toEqual({ width: 1500, height: 2000 })
  })
  it('rounds to whole pixels', () => {
    expect(targetDimensions(4032, 3024)).toEqual({ width: 2000, height: 1500 })
    const r = targetDimensions(3333, 2222)
    expect(Number.isInteger(r.width) && Number.isInteger(r.height)).toBe(true)
  })
})
