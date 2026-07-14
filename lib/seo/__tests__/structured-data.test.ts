import { describe, it, expect } from 'vitest'
import { organizationJsonLd } from '@/lib/seo/structured-data'

describe('organizationJsonLd', () => {
  const ld = organizationJsonLd('https://eazyexchange.com')

  it('is a schema.org Organization', () => {
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('Organization')
  })

  it('carries the brand name and canonical url', () => {
    expect(ld.name).toBe('EazyExchange')
    expect(ld.url).toBe('https://eazyexchange.com')
  })

  it('declares an absolute raster logo Google can crawl', () => {
    expect(ld.logo).toBe('https://eazyexchange.com/icon')
  })

  it('has a non-empty description', () => {
    expect(typeof ld.description).toBe('string')
    expect((ld.description as string).length).toBeGreaterThan(0)
  })
})
