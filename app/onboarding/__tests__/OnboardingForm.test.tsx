import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const completeOnboarding = vi.fn()
vi.mock('@/actions/onboarding', () => ({ completeOnboarding: (...a: unknown[]) => completeOnboarding(...a) }))
const inviteOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({ inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a) }))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

beforeEach(() => {
  push.mockReset()
  completeOnboarding.mockReset().mockResolvedValue(undefined)
  inviteOrganizer.mockReset().mockResolvedValue(undefined)
})

describe('OnboardingForm', () => {
  it('advances to the invite step after saving the school name', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText(/Invitez vos collègues/)).toBeInTheDocument()
    expect(completeOnboarding).toHaveBeenCalledOnce()
  })

  it('lets the user skip straight to the dashboard', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.click(await screen.findByRole('button', { name: 'Passer' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('sends an invite and lists it as sent', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'Lincoln High')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.type(await screen.findByPlaceholderText('adresse@etablissement.fr'), 'c@x.fr')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(inviteOrganizer).toHaveBeenCalledWith('c@x.fr'))
    expect(await screen.findByText('c@x.fr')).toBeInTheDocument()
  })
})
