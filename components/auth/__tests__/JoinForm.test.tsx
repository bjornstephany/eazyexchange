import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const accept = vi.fn().mockResolvedValue({ email: 'c@lycee.fr' })
vi.mock('@/actions/join', () => ({ acceptOrganizerInvite: (...a: unknown[]) => accept(...a) }))
const signIn = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword: (...a: unknown[]) => signIn(...a) } }),
}))
import { JoinForm } from '@/components/auth/JoinForm'

function fill(pw: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Claire Nguyen' } })
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: pw } })
  fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: confirm } })
}

describe('JoinForm', () => {
  beforeEach(() => { accept.mockClear(); signIn.mockClear(); push.mockClear() })

  it('shows school + email context', () => {
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    expect(screen.getByText(/Lycée Mistral/)).toBeInTheDocument()
    expect(screen.getByText('c@lycee.fr')).toBeInTheDocument()
  })

  it('rejects mismatched passwords without calling the action', async () => {
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    fill('longenough', 'different')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(accept).not.toHaveBeenCalled()
  })

  it('accepts, signs in, and redirects to /dashboard', async () => {
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    fill('longenough', 'longenough')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(accept).toHaveBeenCalledWith('tok', 'Claire Nguyen', 'longenough')
    expect(signIn).toHaveBeenCalledWith({ email: 'c@lycee.fr', password: 'longenough' })
  })

  it('surfaces action errors inline', async () => {
    accept.mockRejectedValueOnce(new Error('Cette invitation a été révoquée.'))
    render(<JoinForm token="tok" email="c@lycee.fr" schoolName="Lycée Mistral" />)
    fill('longenough', 'longenough')
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    expect(await screen.findByText('Cette invitation a été révoquée.')).toBeInTheDocument()
  })
})
