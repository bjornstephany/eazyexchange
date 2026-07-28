import { describe, it, expect } from 'vitest'
import { SHIP_STEPS, runSteps } from '../lib/ship-steps.mjs'

describe('SHIP_STEPS', () => {
  it('runs cheapest first, so the common failure surfaces soonest', () => {
    expect(SHIP_STEPS.map((s) => s.key)).toEqual(['lint', 'rls', 'types', 'test', 'build', 'smoke'])
  })

  it('builds before the smoke, which drives what was built', () => {
    const keys = SHIP_STEPS.map((s) => s.key)
    expect(keys.indexOf('build')).toBeLessThan(keys.indexOf('smoke'))
  })

  it('gives every step a reproduction command', () => {
    for (const step of SHIP_STEPS) {
      expect(step.hint, step.key).toBeTruthy()
      expect(step.label, step.key).toBeTruthy()
    }
  })
})

describe('runSteps', () => {
  const steps = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

  it('runs every step in order when all pass', () => {
    const result = runSteps(steps, () => 0)
    expect(result).toEqual({ ok: true, failed: null, ran: ['a', 'b', 'c'] })
  })

  it('stops at the first failure and never runs the later steps', () => {
    const result = runSteps(steps, (s) => (s.key === 'b' ? 1 : 0))
    expect(result.ok).toBe(false)
    expect(result.failed.key).toBe('b')
    expect(result.ran).toEqual(['a', 'b'])
  })

  it('reports the first failure, not the last', () => {
    const result = runSteps(steps, () => 1)
    expect(result.failed.key).toBe('a')
    expect(result.ran).toEqual(['a'])
  })
})
