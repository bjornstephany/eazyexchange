import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

const { confirmSignupCode, resendSignupCode } = vi.hoisted(() => ({
  confirmSignupCode: vi.fn(async (_email: string, _code: string) => ({ ok: false, error: 'invalid_code' as const })),
  resendSignupCode: vi.fn(async (_email: string) => ({ ok: true as const })),
}))
vi.mock('@/app/(auth)/signup/actions', () => ({ confirmSignupCode, resendSignupCode }))

import SignupPage from '@/app/(auth)/signup/page'

beforeEach(() => {
  signUp.mockClear()
  confirmSignupCode.mockClear()
  resendSignupCode.mockClear()
})

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
  await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
}

describe('SignupPage (French)', () => {
  // Creating an account asks for the three things an account needs. The
  // establishment is captured at /onboarding step 1, which validates it against
  // the registry; asking here as well was a duplicate the approval gate made
  // redundant. Asserting absence is the point — re-adding a field would
  // otherwise slip through every other test in this file.
  it('asks for the full name, e-mail and password only', () => {
    render(<SignupPage />)
    expect(screen.getByLabelText(/nom complet/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/votre établissement/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/votre rôle/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/comment nous avez-vous connus/i)).not.toBeInTheDocument()
  })

  it('submits signUp with the full name as the only metadata', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    // toEqual, not toMatchObject: a leftover school_uai or role_description key
    // would mean provisionOrganizer is still being fed data nothing reads.
    expect(arg.options.data).toEqual({ full_name: 'Jane Doe' })
    expect(await screen.findByLabelText(/code de confirmation/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/^e-mail/i), 'a@b')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/adresse e-mail valide/i)).toBeInTheDocument()
  })

  it('submits the 6-digit code to confirmSignupCode', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)
    await user.type(await screen.findByLabelText(/code de confirmation/i), '123456')
    await user.click(screen.getByRole('button', { name: /confirmer/i }))
    expect(confirmSignupCode).toHaveBeenCalledWith('jane@example.com', '123456')
  })

  it('renders a structured error inline when the code is wrong', async () => {
    confirmSignupCode.mockResolvedValueOnce({ ok: false, error: 'invalid_code' })
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)
    await user.type(await screen.findByLabelText(/code de confirmation/i), '000000')
    await user.click(screen.getByRole('button', { name: /confirmer/i }))
    expect(await screen.findByText(/code incorrect/i)).toBeInTheDocument()
  })
})
