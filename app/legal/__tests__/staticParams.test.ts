import { describe, it, expect } from 'vitest'
import { generateStaticParams } from '../[slug]/page'

describe('legal generateStaticParams', () => {
  it('returns all four slugs', () => {
    const params = generateStaticParams()
    expect(params.map((p) => p.slug).sort()).toEqual(['cgu', 'cgv', 'confidentialite', 'mentions-legales'])
  })
})
