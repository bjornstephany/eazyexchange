import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const completeOnboarding = vi.fn()
const completeFirstExchange = vi.fn()
const searchSchools = vi.fn()
vi.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
  completeFirstExchange: (...a: unknown[]) => completeFirstExchange(...a),
  searchSchools: (...a: unknown[]) => searchSchools(...a),
}))
const inviteOrganizer = vi.fn()
vi.mock('@/actions/settings', () => ({ inviteOrganizer: (...a: unknown[]) => inviteOrganizer(...a) }))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

// Step 2's Destination and both travel dates are required HTML5 fields; fill
// them before submitting so the browser lets the submit event through.
function fillProgramDetails() {
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'le Minnesota, USA' } })
  fireEvent.change(screen.getByLabelText('Date de départ'), { target: { value: '2026-10-17' } })
  fireEvent.change(screen.getByLabelText('Date de retour'), { target: { value: '2026-11-02' } })
}

const CHEVREUL = {
  id: 1, uai: '0690574Z', name: 'Lycée Chevreul Lestonnac', type: 'Lycée',
  status: 'Privé', commune: 'Lyon', postal_code: '69007',
}

beforeEach(() => {
  push.mockReset()
  completeOnboarding.mockReset().mockResolvedValue({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
  completeFirstExchange.mockReset().mockResolvedValue({ ok: true })
  searchSchools.mockReset().mockResolvedValue([CHEVREUL])
  inviteOrganizer.mockReset().mockResolvedValue(undefined)
})

describe('OnboardingForm', () => {
  it('walks school -> exchange -> invite, then reaches the dashboard', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()

    // Step 1: pick a real French establishment from the registry
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'FR', uai: '0690574Z', name: '',
    }))

    // Step 2: exchange name + required destination/dates; free-text cards optional
    await user.type(await screen.findByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    expect(completeFirstExchange.mock.calls[0][0]).toBe('Espagne 2026')
    expect(completeFirstExchange.mock.calls[0][1]).toMatchObject({
      destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
      sending_school_name: 'Lycée Chevreul Lestonnac',
    })

    // Step 3: invite step (optional)
    expect(await screen.findByText(/Invitez vos collègues/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('shows the server error and stays on the exchange step when the details are rejected', async () => {
    completeFirstExchange.mockResolvedValue({ ok: false, error: 'invalid', message: 'Renseignez la destination et les deux dates du voyage.' })
    render(<OnboardingForm initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByText('Renseignez la destination et les deux dates du voyage.')).toBeInTheDocument()
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
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.type(await screen.findByPlaceholderText('adresse@etablissement.fr'), 'c@x.fr')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))
    await waitFor(() => expect(inviteOrganizer).toHaveBeenCalledWith('c@x.fr'))
    expect(await screen.findByText('c@x.fr')).toBeInTheDocument()
  })
})

describe('OnboardingForm — step 1 establishment gate', () => {
  it('defaults to France and shows the registry combobox, not a free-text name field', () => {
    render(<OnboardingForm />)
    expect(screen.getByLabelText('Pays')).toHaveValue('FR')
    expect(screen.getByLabelText('Votre établissement')).toHaveAttribute('role', 'combobox')
    expect(screen.queryByLabelText('Nom de l’établissement')).not.toBeInTheDocument()
  })

  it('searches only from two characters up, debounced', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'c')
    await waitFor(() => expect(searchSchools).not.toHaveBeenCalled())
    await user.type(screen.getByLabelText('Votre établissement'), 'h')
    await waitFor(() => expect(searchSchools).toHaveBeenCalledWith('ch'))
  })

  it('cannot submit until an establishment is picked', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled()
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('offers a contact link instead of a free-text fallback', async () => {
    render(<OnboardingForm />)
    const link = screen.getByRole('link', { name: /Je ne trouve pas mon établissement/ })
    expect(link.getAttribute('href')).toMatch(/^mailto:/)
  })

  it('says so when the registry returns nothing', async () => {
    searchSchools.mockResolvedValue([])
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'zzzz')
    expect(await screen.findByText('Aucun établissement trouvé.')).toBeInTheDocument()
  })

  it('swaps the combobox for a free-text name field on another country', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Pays'), 'Espagne')
    expect(screen.queryByLabelText('Votre établissement')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Nom de l’établissement'), 'Colegio San Miguel')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'Espagne', uai: null, name: 'Colegio San Miguel',
    }))
  })

  it('reveals a free-text country field for « Autre pays »', async () => {
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Pays'), 'other')
    await user.type(screen.getByLabelText('Précisez le pays'), 'Canada')
    await user.type(screen.getByLabelText('Nom de l’établissement'), 'Collège Saint-Laurent')
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'Canada', uai: null, name: 'Collège Saint-Laurent',
    }))
  })

  it('shows the server rejection and stays on step 1', async () => {
    completeOnboarding.mockResolvedValue({
      ok: false, error: 'unknown_school',
      message: 'Cet établissement est introuvable dans l’annuaire officiel. Sélectionnez-le dans la liste.',
    })
    render(<OnboardingForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText(/introuvable dans l’annuaire officiel/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nom du programme')).not.toBeInTheDocument()
  })
})
