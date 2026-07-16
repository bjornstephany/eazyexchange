import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingPage } from '@/components/landing/LandingPage'
import { landingContent } from '@/lib/landing/content'

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  })
}

const originalLanguages = Object.getOwnPropertyDescriptor(window.navigator, 'languages')
function setBrowserLanguages(langs: readonly string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true })
}

describe('LandingPage locale selection', () => {
  beforeEach(clearCookies)
  afterEach(() => {
    if (originalLanguages) Object.defineProperty(window.navigator, 'languages', originalLanguages)
  })

  it('renders all five locales in the dictionary', () => {
    expect(Object.keys(landingContent).sort()).toEqual(['de', 'en', 'es', 'fr', 'it'])
  })

  it('honors the NEXT_LOCALE cookie on mount (over the browser language)', () => {
    setBrowserLanguages(['en-US'])
    document.cookie = 'NEXT_LOCALE=fr; path=/'
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      landingContent.fr.hero.title
    )
  })

  it('falls back to the browser language when no cookie is set', () => {
    setBrowserLanguages(['fr-FR', 'en-US'])
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      landingContent.fr.hero.title
    )
  })

  it('falls back to the default locale for an unsupported browser language', () => {
    setBrowserLanguages(['pt-BR'])
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      landingContent.en.hero.title
    )
  })
})
