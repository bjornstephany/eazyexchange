import { describe, it, expect } from 'vitest'
import { landingContent } from '@/lib/landing/content'

describe('landingContent', () => {
  it('routes the primary CTAs to /signup and /login', () => {
    expect(landingContent.hero.primaryCta.href).toBe('/signup')
    expect(landingContent.hero.secondaryCta.href).toBe('/login')
    expect(landingContent.nav.getStarted.href).toBe('/signup')
    expect(landingContent.nav.login.href).toBe('/login')
  })

  it('every pricing tier has a /signup CTA and at least one feature', () => {
    expect(landingContent.pricing.tiers.length).toBeGreaterThanOrEqual(2)
    for (const tier of landingContent.pricing.tiers) {
      expect(tier.cta.href).toBe('/signup')
      expect(tier.features.length).toBeGreaterThan(0)
    }
  })

  it('exposes feature and step lists for rendering', () => {
    expect(landingContent.features.items.length).toBeGreaterThan(0)
    expect(landingContent.howItWorks.steps.length).toBe(4)
  })
})
