import { describe, it, expect, beforeEach } from 'vitest'
import { resumeStorageKey, storeResumeToken, readResumeToken, clearResumeToken } from '@/lib/apply-storage'

describe('apply-storage', () => {
  beforeEach(() => localStorage.clear())

  it('builds the per-slug key', () => {
    expect(resumeStorageKey('france-canada')).toBe('eazyapply:france-canada')
  })

  it('stores, reads back, and clears a token', () => {
    storeResumeToken('france-canada', 'tok-123')
    expect(readResumeToken('france-canada')).toBe('tok-123')
    clearResumeToken('france-canada')
    expect(readResumeToken('france-canada')).toBeNull()
  })

  it('returns null for a slug that was never stored', () => {
    expect(readResumeToken('nope')).toBeNull()
  })
})
