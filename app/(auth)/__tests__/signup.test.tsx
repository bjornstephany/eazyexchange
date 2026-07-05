import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => { signUp.mockClear() })

describe('SignupPage (French)', () => {
  it('does not render an Établissement field', () => {
    render(<SignupPage />)
    expect(screen.queryByLabelText(/établissement/i)).toBeNull()
  })

  it('submits signUp with only the full name and shows the check-email state', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/e-mail/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(await screen.findByText(/vérifiez votre e-mail/i)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/e-mail/i), 'a@b')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/adresse e-mail valide/i)).toBeInTheDocument()
  })
})
