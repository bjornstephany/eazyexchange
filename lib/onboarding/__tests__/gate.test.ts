import { describe, it, expect } from 'vitest'
import { mustOnboard } from '@/lib/onboarding/gate'

describe('mustOnboard', () => {
  it('requires onboarding when the school name is blank', () => {
    expect(mustOnboard('', 3)).toBe(true)
  })
  it('requires onboarding when the school owns no exchange', () => {
    expect(mustOnboard('Lincoln High', 0)).toBe(true)
  })
  it('does not require onboarding once named with at least one exchange', () => {
    expect(mustOnboard('Lincoln High', 1)).toBe(false)
  })
})
