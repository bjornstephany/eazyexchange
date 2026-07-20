// lib/legal/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import { hasPlaceholders } from '../types'
import type { LegalDocument } from '../types'

const base: LegalDocument = {
  slug: 'x',
  title: 'X',
  lastUpdated: '2026-07-20',
  sections: [{ id: 's1', heading: 'H', blocks: [{ t: 'p', text: 'Bonjour' }] }],
}

describe('hasPlaceholders', () => {
  it('is false when no placeholder token is present', () => {
    expect(hasPlaceholders(base)).toBe(false)
  })
  it('detects a placeholder in a paragraph', () => {
    expect(hasPlaceholders({ ...base, sections: [{ id: 's1', heading: 'H', blocks: [{ t: 'p', text: 'Éditeur : [PLACEHOLDER]' }] }] })).toBe(true)
  })
  it('detects a placeholder in a list item', () => {
    expect(hasPlaceholders({ ...base, sections: [{ id: 's1', heading: 'H', blocks: [{ t: 'ul', items: ['ok', 'SIREN : [PLACEHOLDER]'] }] }] })).toBe(true)
  })
  it('detects a placeholder in the intro', () => {
    expect(hasPlaceholders({ ...base, intro: 'Édité par [PLACEHOLDER].' })).toBe(true)
  })
  it('detects the hinted placeholder form [PLACEHOLDER : hint]', () => {
    expect(hasPlaceholders({ ...base, sections: [{ id: 's1', heading: 'H', blocks: [{ t: 'p', text: 'SIREN : [PLACEHOLDER : SIREN]' }] }] })).toBe(true)
  })
})
