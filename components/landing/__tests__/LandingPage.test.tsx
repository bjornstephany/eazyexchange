import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LandingPage } from '@/components/landing/LandingPage'

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  })
}

describe('LandingPage', () => {
  beforeEach(() => {
    clearCookies()
    // Pin this suite to French so the FR copy / link labels below are
    // deterministic regardless of the (jsdom) browser language.
    document.cookie = 'NEXT_LOCALE=fr; path=/'
  })

  it('renders French when the fr cookie is set', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Arrêtez')
  })

  it('switches to English via the language dropdown and persists to the NEXT_LOCALE cookie', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /changer de langue/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Stop chasing')
    expect(document.cookie).toContain('NEXT_LOCALE=en')
  })

  it('the language menu opens and lists the available languages', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /changer de langue/i }))
    expect(screen.getByRole('menuitem', { name: 'Français' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'English' })).toBeInTheDocument()
  })

  it('hydrates the language from the NEXT_LOCALE cookie on mount', () => {
    document.cookie = 'NEXT_LOCALE=en; path=/'
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Stop chasing')
  })

  it('primary CTAs link to /signup and the login link to /login', () => {
    render(<LandingPage />)
    const ctas = screen.getAllByRole('link', { name: /Démarrer gratuitement/i })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    ctas.forEach((l) => expect(l.getAttribute('href')).toBe('/signup'))
    expect(screen.getByRole('link', { name: /Connexion/i }).getAttribute('href')).toBe('/login')
  })

  it('the features nav link targets the #features anchor', () => {
    render(<LandingPage />)
    expect(screen.getByRole('link', { name: /Fonctionnalités/i }).getAttribute('href')).toBe('#features')
  })
})
