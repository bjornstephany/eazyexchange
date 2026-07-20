import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const completeOnboarding = vi.fn()
const completeFirstExchange = vi.fn()
vi.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
  completeFirstExchange: (...a: unknown[]) => completeFirstExchange(...a),
}))
const inviteOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({ inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a) }))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

beforeEach(() => {
  push.mockReset()
  completeOnboarding.mockReset().mockResolvedValue(undefined)
  completeFirstExchange.mockReset().mockResolvedValue({ ok: true })
  inviteOrganizer.mockReset().mockResolvedValue(undefined)
})

describe('OnboardingForm', () => {
  it('walks name -> exchange -> invite, then reaches the dashboard', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()

    // Step 1: school name
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    // Step 2: exchange name + at least one filled card
    await user.type(await screen.findByLabelText('Nom du programme'), 'Espagne 2026')
    await user.type(screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA')!, 'Départ le 3 mai')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    expect(completeFirstExchange.mock.calls[0][0]).toBe('Espagne 2026')

    // Step 3: invite step (optional)
    expect(await screen.findByText(/Invitez vos collègues/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('shows the server error and stays on the exchange step when no card is filled', async () => {
    completeFirstExchange.mockResolvedValue({ ok: false, error: 'noCards', message: 'Renseignez au moins une information sur le programme.' })
    render(<OnboardingForm initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    // Match the server error's unique tail: the static "Renseignez au moins une
    // information." hint also lives on this step, so a looser regex is ambiguous.
    expect(await screen.findByText(/au moins une information sur le programme/)).toBeInTheDocument()
    expect(screen.queryByText(/Invitez vos collègues/)).not.toBeInTheDocument()
  })

  it('starts on the exchange step when initialStep is 2', async () => {
    render(<OnboardingForm initialStep={2} />)
    expect(screen.getByLabelText('Nom du programme')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).not.toBeInTheDocument()
  })

  it('sends an invite from the final step and lists it as sent', async () => {
    render(<OnboardingForm initialStep={2} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    await user.type(screen.getAllByRole('textbox').find(el => el.tagName === 'TEXTAREA')!, 'Info')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.type(await screen.findByPlaceholderText('adresse@etablissement.fr'), 'c@x.fr')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(inviteOrganizer).toHaveBeenCalledWith('c@x.fr'))
    expect(await screen.findByText('c@x.fr')).toBeInTheDocument()
  })
})
