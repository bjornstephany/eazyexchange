import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

type SignUpArg = { email: string; password: string; options: { data: Record<string, string> } }
const signUp = vi.fn(async (_arg: SignUpArg) => ({ data: { user: { id: 'u1' } }, error: null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signUp } }) }))

// The signup form is unauthenticated, so its establishment picker goes through
// the anonymous twin of searchSchools.
const LYCEE = {
  id: 1, uai: '0690123X', name: 'Lycée Jean Moulin', type: 'LYC',
  status: null, commune: 'Lyon', postal_code: '69003',
}
const { searchPublicSchools } = vi.hoisted(() => ({
  searchPublicSchools: vi.fn(async (_q: string) => [] as unknown[]),
}))
vi.mock('@/actions/public-schools', () => ({ searchPublicSchools }))

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
  searchPublicSchools.mockReset()
  searchPublicSchools.mockResolvedValue([LYCEE])
})

async function pickSchool(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/votre établissement/i), 'jean moulin')
  // The combobox debounces 250ms before querying.
  await user.click(await screen.findByRole('option', { name: /Lycée Jean Moulin/ }))
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nom complet/i), 'Jane Doe')
  await pickSchool(user)
  await user.type(screen.getByLabelText(/votre rôle/i), 'Professeure')
  await user.type(screen.getByLabelText(/comment nous avez-vous connus/i), 'Recommandation')
  await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
  await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
}

async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user)
  await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
}

describe('SignupPage (French)', () => {
  // The approval queue is only reviewable if the request carries who is asking
  // and from where, so signup collects the establishment up front again.
  it('renders the establishment picker and the two intake fields', () => {
    render(<SignupPage />)
    expect(screen.getByLabelText(/votre établissement/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/votre rôle/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/comment nous avez-vous connus/i)).toBeInTheDocument()
  })

  it('submits signUp with the intake metadata and shows the code step', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await reachCodeStep(user)

    expect(signUp).toHaveBeenCalledTimes(1)
    const arg = signUp.mock.calls[0][0]
    expect(arg.email).toBe('jane@example.com')
    expect(arg.options.data).toEqual({
      full_name: 'Jane Doe',
      school_uai: '0690123X',
      school_name: 'Lycée Jean Moulin',
      school_country: 'FR',
      role_description: 'Professeure',
      how_found_us: 'Recommandation',
    })
    expect(await screen.findByLabelText(/code de confirmation/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument()
  })

  // The picker is a combobox, not a `required` input, so nothing but this check
  // stops a signup that names no establishment — and an unattributable request
  // is one the review queue cannot act on.
  it('refuses to submit without an establishment', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await user.type(screen.getByLabelText(/votre rôle/i), 'Professeure')
    await user.type(screen.getByLabelText(/comment nous avez-vous connus/i), 'Recommandation')
    await user.type(screen.getByLabelText(/^e-mail/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/mot de passe/i), 'supersecret')
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }))
    expect(signUp).not.toHaveBeenCalled()
    expect(await screen.findByText(/sélectionner votre établissement/i)).toBeInTheDocument()
  })

  it('shows a validation error for a bad email and does not call signUp', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText(/nom complet/i), 'Jane')
    await pickSchool(user)
    await user.type(screen.getByLabelText(/votre rôle/i), 'Professeure')
    await user.type(screen.getByLabelText(/comment nous avez-vous connus/i), 'Recommandation')
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
