import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { draftKey } from '@/lib/onboarding/draft'

const completeOnboarding = vi.fn()
const completeFirstExchange = vi.fn()
const searchSchools = vi.fn()
vi.mock('@/actions/onboarding', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
  completeFirstExchange: (...a: unknown[]) => completeFirstExchange(...a),
  searchSchools: (...a: unknown[]) => searchSchools(...a),
}))

import { OnboardingForm } from '@/app/onboarding/OnboardingForm'

// Step 2's Destination and both travel dates are required HTML5 fields; fill
// them before submitting so the browser lets the submit event through.
function fillProgramDetails(end = '2026-11-02') {
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'le Minnesota, USA' } })
  fireEvent.change(screen.getByLabelText('Date de départ'), { target: { value: '2026-10-17' } })
  fireEvent.change(screen.getByLabelText('Date de retour'), { target: { value: end } })
}

const CHEVREUL = {
  id: 1, uai: '0690574Z', name: 'Lycée Chevreul Lestonnac', type: 'Lycée',
  status: 'Privé', commune: 'Lyon', postal_code: '69007',
}

// What the browser ACTUALLY sees when completeFirstExchange succeeds. The
// action ends in redirect(), and Next signals that to the client by REJECTING
// the action promise with a NEXT_REDIRECT-digest error (server-action-reducer
// rejects, then navigates). The promise never resolves to undefined — assuming
// it did is what let the red-error flash ship.
function redirectRejection(url = '/applications') {
  const err = new Error('NEXT_REDIRECT') as Error & { digest?: string }
  err.digest = `NEXT_REDIRECT;push;${url};307;`
  return err
}

beforeEach(() => {
  window.localStorage.clear()
  completeOnboarding.mockReset().mockResolvedValue({ ok: true, schoolName: 'Lycée Chevreul Lestonnac' })
  completeFirstExchange.mockReset().mockRejectedValue(redirectRejection())
  searchSchools.mockReset().mockResolvedValue([CHEVREUL])
})

describe('OnboardingForm', () => {
  it('walks school -> exchange and submits the two required arguments', async () => {
    render(<OnboardingForm schoolId="s1" />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledWith({
      country: 'FR', uai: '0690574Z', name: 'Lycée Chevreul Lestonnac',
    }))

    await user.type(await screen.findByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    expect(completeFirstExchange.mock.calls[0]).toHaveLength(2)
    expect(completeFirstExchange.mock.calls[0][0]).toBe('Espagne 2026')
    expect(completeFirstExchange.mock.calls[0][1]).toEqual({
      destination: 'le Minnesota, USA', travel_start: '2026-10-17', travel_end: '2026-11-02',
    })
  })

  it('has no invite-a-colleague step and no optional fields', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    expect(screen.queryByText(/Invitez vos collègues/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Informations complémentaires/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nom de l’association')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ville du lycée')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Titre 1')).not.toBeInTheDocument()
  })

  it('shows the server error and stays on the exchange step when rejected', async () => {
    completeFirstExchange.mockResolvedValue({
      error: 'invalid', message: 'Renseignez la destination et les deux dates du voyage.',
    })
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(await screen.findByText('Renseignez la destination et les deux dates du voyage.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom du programme')).toBeInTheDocument()
  })

  // The redirect IS the success signal. Treating its rejection as a failure
  // flashed « Une erreur est survenue » in red over a submit that had just
  // worked, for as long as the SPA navigation to /applications took.
  it('shows no error when the submit succeeds and the action redirects', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.queryByText('Une erreur est survenue. Réessayez.')).not.toBeInTheDocument())
  })

  // The router is already navigating away, so re-enabling the button would
  // flip « Enregistrement… » back to « Continuer » for the whole transition.
  it('stays busy while the redirect navigation runs', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled())
  })

  it('starts on the exchange step when initialStep is 2', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    expect(screen.getByLabelText('Nom du programme')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).not.toBeInTheDocument()
  })
})

describe('OnboardingForm — travel date order', () => {
  it('shows the ordering error on selection, before any submit', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-01')
    expect(await screen.findByText('La date de retour doit être après la date de départ.')).toBeInTheDocument()
    expect(completeFirstExchange).not.toHaveBeenCalled()
  })

  it('rejects a return on the same day as the departure', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-17')
    expect(await screen.findByText('La date de retour doit être après la date de départ.')).toBeInTheDocument()
  })

  it('disables Continuer while the dates are out of order', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-01')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled())
  })

  it('clears the error and re-enables Continuer once the dates are fixed', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fillProgramDetails('2026-10-01')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled())
    fireEvent.change(screen.getByLabelText('Date de retour'), { target: { value: '2026-11-02' } })
    await waitFor(() =>
      expect(screen.queryByText('La date de retour doit être après la date de départ.')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled()
  })

  it('shows nothing while only one date is set', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fireEvent.change(screen.getByLabelText('Date de départ'), { target: { value: '2026-10-17' } })
    expect(screen.queryByText('La date de retour doit être après la date de départ.')).not.toBeInTheDocument()
  })
})

describe('OnboardingForm — abandoned tab', () => {
  it('restores what was typed in step 2', async () => {
    window.localStorage.setItem(draftKey('s1'), JSON.stringify({
      v: 1, exchangeName: 'Espagne 2026', destination: 'le Minnesota, USA',
      travel_start: '2026-10-17', travel_end: '2026-11-02',
    }))
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du programme')).toHaveValue('Espagne 2026'))
    expect(screen.getByLabelText('Destination')).toHaveValue('le Minnesota, USA')
    expect(screen.getByLabelText('Date de retour')).toHaveValue('2026-11-02')
  })

  it('ignores a draft belonging to another school', async () => {
    window.localStorage.setItem(draftKey('s2'), JSON.stringify({
      v: 1, exchangeName: 'Autre', destination: '', travel_start: '', travel_end: '',
    }))
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    await waitFor(() => expect(screen.getByLabelText('Nom du programme')).toHaveValue(''))
  })

  it('saves as the organizer types', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    fireEvent.change(screen.getByLabelText('Nom du programme'), { target: { value: 'Espagne 2026' } })
    await waitFor(() => {
      const raw = window.localStorage.getItem(draftKey('s1'))
      expect(raw && JSON.parse(raw).exchangeName).toBe('Espagne 2026')
    })
  })

  // clearDraft runs before the action; the catch used to put the draft straight
  // back, so a completed onboarding left a stale draft behind in localStorage.
  it('leaves the draft cleared when the submit succeeds and redirects', async () => {
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await waitFor(() => expect(completeFirstExchange).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.localStorage.getItem(draftKey('s1'))).toBeNull())
  })

  it('keeps the draft when the submit is rejected', async () => {
    completeFirstExchange.mockResolvedValue({ error: 'limit', message: 'Limite atteinte.' })
    render(<OnboardingForm schoolId="s1" initialStep={2} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nom du programme'), 'Espagne 2026')
    fillProgramDetails()
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await screen.findByText('Limite atteinte.')
    const raw = window.localStorage.getItem(draftKey('s1'))
    expect(raw && JSON.parse(raw).exchangeName).toBe('Espagne 2026')
  })
})

describe('OnboardingForm — step 1 establishment gate', () => {
  it('defaults to France and shows the registry combobox, not a free-text name field', () => {
    render(<OnboardingForm schoolId="s1" />)
    expect(screen.getByLabelText('Pays')).toHaveValue('FR')
    expect(screen.getByLabelText('Votre établissement')).toHaveAttribute('role', 'combobox')
    expect(screen.queryByLabelText('Nom de l’établissement')).not.toBeInTheDocument()
  })

  it('searches only from two characters up, debounced', async () => {
    render(<OnboardingForm schoolId="s1" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'c')
    await waitFor(() => expect(searchSchools).not.toHaveBeenCalled())
    await user.type(screen.getByLabelText('Votre établissement'), 'h')
    await waitFor(() => expect(searchSchools).toHaveBeenCalledWith('ch'))
  })

  it('cannot submit until an establishment is picked', async () => {
    render(<OnboardingForm schoolId="s1" />)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled()
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeEnabled()
    expect(completeOnboarding).not.toHaveBeenCalled()
  })

  it('offers a contact link instead of a free-text fallback', async () => {
    render(<OnboardingForm schoolId="s1" />)
    const link = screen.getByRole('link', { name: /Je ne trouve pas mon établissement/ })
    expect(link.getAttribute('href')).toMatch(/^mailto:/)
  })

  it('says so when the registry returns nothing', async () => {
    searchSchools.mockResolvedValue([])
    render(<OnboardingForm schoolId="s1" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'zzzz')
    expect(await screen.findByText('Aucun établissement trouvé.')).toBeInTheDocument()
  })

  it('swaps the combobox for a free-text name field on another country', async () => {
    render(<OnboardingForm schoolId="s1" />)
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
    render(<OnboardingForm schoolId="s1" />)
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
    render(<OnboardingForm schoolId="s1" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Votre établissement'), 'chevreul')
    await user.click(await screen.findByRole('option', { name: /Lycée Chevreul Lestonnac/ }))
    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(await screen.findByText(/introuvable dans l’annuaire officiel/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nom du programme')).not.toBeInTheDocument()
  })
})
