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

describe('RootPage', () => {
  it('renders the landing page with Organization JSON-LD', () => {
    const result = RootPage()
    const children = ([] as unknown[]).concat(result.props.children)
    expect(children.some((c) => (c as { type?: unknown })?.type === LandingPage)).toBe(true)
    const script = children.find(
      (c) => (c as { props?: { type?: string } })?.props?.type === 'application/ld+json',
    )
    expect(script).toBeDefined()
  })
})
