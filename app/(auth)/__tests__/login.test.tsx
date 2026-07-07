import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { vi } from 'vitest'
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import LoginPage from '@/app/(auth)/login/page'

describe('LoginPage error banner (French)', () => {
  it('surfaces the signup_failed message', async () => {
    window.history.pushState({}, '', '/login?error=signup_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/pas pu terminer la création/i)).toBeInTheDocument()
  })
  it('surfaces the invite_invalid message', async () => {
    window.history.pushState({}, '', '/login?error=invite_invalid')
    render(<LoginPage />)
    expect(await screen.findByText(/invitation est invalide ou a expiré/i)).toBeInTheDocument()
  })
  it('surfaces the oauth_failed message', async () => {
    window.history.pushState({}, '', '/login?error=oauth_failed')
    render(<LoginPage />)
    expect(await screen.findByText(/connexion avec google a échoué/i)).toBeInTheDocument()
  })
  it('surfaces the not_invited message', async () => {
    window.history.pushState({}, '', '/login?error=not_invited')
    render(<LoginPage />)
    expect(await screen.findByText(/associer votre compte google à une invitation/i)).toBeInTheDocument()
  })
})

describe('LoginPage layout', () => {
  it('shows the "ou continuer avec" separator and a Google button labelled Google', () => {
    window.history.pushState({}, '', '/login')
    render(<LoginPage />)
    expect(screen.getByText(/ou continuer avec/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument()
  })
  it('links to the signup page', () => {
    window.history.pushState({}, '', '/login')
    render(<LoginPage />)
    expect(screen.getByRole('link', { name: /Créer un compte/i })).toHaveAttribute('href', '/signup')
  })
})
