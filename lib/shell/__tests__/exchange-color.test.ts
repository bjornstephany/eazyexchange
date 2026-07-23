import { describe, it, expect } from 'vitest'
import { exchangeDotColor, PALETTE } from '@/lib/shell/exchange-color'

const IDS = [
  '2f1c9a3e-7b64-4c21-9d0a-88ef1234ab01',
  '9d0a88ef-1234-4ab0-8f1c-2f1c9a3e7b64',
  'c3d4e5f6-a7b8-49c0-b1d2-e3f4a5b60718',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'ex1',
  'ex2',
  'ex3',
]

describe('exchangeDotColor', () => {
  it('is stable for the same id', () => {
    for (const id of IDS) {
      expect(exchangeDotColor(id)).toBe(exchangeDotColor(id))
    }
  })

  it('always returns a palette member', () => {
    for (const id of IDS) {
      expect(PALETTE).toContain(exchangeDotColor(id))
    }
  })

  it('spreads across more than one palette entry', () => {
    const distinct = new Set(IDS.map(exchangeDotColor))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('handles the empty string without throwing', () => {
    expect(PALETTE).toContain(exchangeDotColor(''))
  })
})
