// lib/legal/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest'
import { LEGAL_SLUGS, LEGAL_DOCUMENTS, getLegalDocument } from '../index'

describe('legal registry', () => {
  it('exposes exactly the four slugs', () => {
    expect([...LEGAL_SLUGS].sort()).toEqual(['cgu', 'cgv', 'confidentialite', 'mentions-legales'])
  })

  it('every document is well-formed', () => {
    for (const slug of LEGAL_SLUGS) {
      const doc = LEGAL_DOCUMENTS[slug]
      expect(doc.slug).toBe(slug)
      expect(doc.title.length).toBeGreaterThan(0)
      expect(Number.isNaN(Date.parse(doc.lastUpdated))).toBe(false)
      expect(doc.sections.length).toBeGreaterThan(0)
      const ids = doc.sections.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length) // ids unique within a doc
      for (const s of doc.sections) {
        expect(s.heading.length).toBeGreaterThan(0)
        expect(s.id.length).toBeGreaterThan(0)
        expect(s.blocks.length).toBeGreaterThan(0)
      }
    }
  })

  it('resolves known slugs and rejects unknown ones', () => {
    expect(getLegalDocument('cgu')?.slug).toBe('cgu')
    expect(getLegalDocument('nope')).toBeNull()
  })
})
