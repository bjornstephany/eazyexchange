import { describe, it, expect } from 'vitest'
import { resolvePort } from '../lib/port.mjs'

describe('resolvePort', () => {
  it('defaults to 3000 when there is no pinned port', () => {
    expect(resolvePort(null)).toBe('3000')
    expect(resolvePort(undefined)).toBe('3000')
    expect(resolvePort('')).toBe('3000')
  })

  it('uses a pinned port, trimming whitespace', () => {
    expect(resolvePort('3407')).toBe('3407')
    expect(resolvePort('  3407\n')).toBe('3407')
  })

  it('falls back to 3000 on anything that is not a port', () => {
    expect(resolvePort('abc')).toBe('3000')
    expect(resolvePort('3407; rm -rf /')).toBe('3000')
    expect(resolvePort('7')).toBe('3000')
    expect(resolvePort('999999')).toBe('3000')
  })
})
