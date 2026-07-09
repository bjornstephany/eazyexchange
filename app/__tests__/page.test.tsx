import { describe, it, expect } from 'vitest'
import RootPage from '@/app/page'
import { LandingPage } from '@/components/landing/LandingPage'

// The logged-in redirect for / lives in middleware.ts (see middleware.test.ts).
// This page must stay free of auth/DB reads so it prerenders — RootPage is a
// plain synchronous component that always renders the landing page.
describe('RootPage', () => {
  it('renders the landing page unconditionally', () => {
    const result = RootPage()
    expect(result.type).toBe(LandingPage)
  })
})
