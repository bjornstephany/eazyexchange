import { describe, it, expect } from 'vitest'
import RootPage, { metadata } from '@/app/page'
import { LandingPage } from '@/components/landing/LandingPage'

describe('RootPage metadata', () => {
  it('has a title short enough to survive Google truncation, keeping the key phrase', () => {
    const title = metadata.title as string
    expect(typeof title).toBe('string')
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title).toContain('échanges scolaires')
  })

  it('declares Open Graph and a large-image Twitter card', () => {
    expect(metadata.openGraph).toBeDefined()
    expect(metadata.openGraph?.title).toBe(metadata.title)
    expect(metadata.twitter).toBeDefined()
    expect((metadata.twitter as { card?: string }).card).toBe('summary_large_image')
  })
})

// Unchanged from the original test — RootPage still returns <LandingPage/> after
// this task. Task 4 rewrites this spec when RootPage gains the JSON-LD fragment.
describe('RootPage', () => {
  it('renders the landing page unconditionally', () => {
    const result = RootPage()
    expect(result.type).toBe(LandingPage)
  })
})
