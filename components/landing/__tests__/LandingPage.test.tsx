import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LandingPage } from '@/components/landing/LandingPage'

describe('LandingPage', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders French by default', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Arrêtez')
  })

  it('switches to English via the language dropdown and persists the choice', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /changer de langue/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Stop chasing')
    expect(window.localStorage.getItem('ee_lang')).toBe('en')
  })

  it('the language menu opens and lists both languages', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: /changer de langue/i }))
    expect(screen.getByRole('menuitem', { name: 'Français' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'English' })).toBeInTheDocument()
  })

  it('hydrates the stored language on mount', () => {
    window.localStorage.setItem('ee_lang', 'en')
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
