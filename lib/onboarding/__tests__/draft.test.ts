import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  draftKey, serializeDraft, parseDraft, isEmptyDraft,
  loadDraft, saveDraft, clearDraft,
  type OnboardingDraft,
} from '@/lib/onboarding/draft'

const filled: OnboardingDraft = {
  exchangeName: 'Espagne 2026',
  destination: 'le Minnesota, USA',
  travel_start: '2026-10-17',
  travel_end: '2026-11-02',
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('draftKey', () => {
  it('scopes the draft to the school', () => {
    expect(draftKey('s1')).toBe('eazyexchange:onboarding-draft:s1')
    expect(draftKey('s2')).not.toBe(draftKey('s1'))
  })
})

describe('parseDraft', () => {
  it('round-trips a serialized draft', () => {
    expect(parseDraft(serializeDraft(filled))).toEqual(filled)
  })
  it('returns null for absent storage', () => {
    expect(parseDraft(null)).toBeNull()
  })
  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseDraft('{not json')).toBeNull()
  })
  it('rejects a draft written by a future version', () => {
    expect(parseDraft(JSON.stringify({ v: 99, exchangeName: 'x' }))).toBeNull()
  })
  it('coerces non-string members to empty strings', () => {
    expect(parseDraft(JSON.stringify({ v: 1, exchangeName: 42, destination: 'ok' })))
      .toEqual({ exchangeName: '', destination: 'ok', travel_start: '', travel_end: '' })
  })
})

describe('isEmptyDraft', () => {
  it('is true for blanks and whitespace', () => {
    expect(isEmptyDraft({ exchangeName: '  ', destination: '', travel_start: '', travel_end: '' })).toBe(true)
  })
  it('is false once anything is typed', () => {
    expect(isEmptyDraft({ ...filled })).toBe(false)
  })
})

describe('save/load/clear', () => {
  it('persists and restores a draft', () => {
    saveDraft('s1', filled)
    expect(loadDraft('s1')).toEqual(filled)
  })
  it('does not leak between schools', () => {
    saveDraft('s1', filled)
    expect(loadDraft('s2')).toBeNull()
  })
  it('removes the entry instead of storing an empty draft', () => {
    saveDraft('s1', filled)
    saveDraft('s1', { exchangeName: '', destination: '', travel_start: '', travel_end: '' })
    expect(window.localStorage.getItem(draftKey('s1'))).toBeNull()
  })
  it('clears the entry', () => {
    saveDraft('s1', filled)
    clearDraft('s1')
    expect(loadDraft('s1')).toBeNull()
  })
  it('swallows a storage failure rather than breaking onboarding', () => {
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveDraft('s1', filled)).not.toThrow()
  })
  it('returns null when reading storage throws', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(loadDraft('s1')).toBeNull()
  })
})
