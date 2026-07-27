import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import fr from '@/messages/fr.json'
import { TOUR_STEPS } from '@/lib/tour/steps'
import type { TourState } from '@/types/db'

let mockPathname = '/applications'
const push = vi.fn()
const setTourState = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({
  createExchange: vi.fn(),
  getExchangeProgressSummaries: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/actions/tour', () => ({ setTourState: (s: TourState) => setTourState(s) }))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false }]

// The real shell, so the data-tour anchors under test are the actual ones.
function renderShell({
  tourState = 'pending' as TourState,
  pathname = '/applications',
  withExchange = true,
} = {}) {
  mockPathname = pathname
  // A FRESH element per render: React bails out of re-rendering a subtree given
  // a referentially identical element, which would silently defeat navigateTo.
  const tree = () => (
    <OrganizerShell
      exchanges={withExchange ? exchanges : []}
      activeExchangeId={withExchange ? 'ex1' : null}
      organizerName="Marie Bernard"
      schoolName="Lycée Mistral"
      tourState={tourState}
    >
      <p>page</p>
    </OrganizerShell>
  )
  const result = renderWithIntl(tree())
  return {
    ...result,
    // usePathname is read at render, so a route change has to be re-rendered to
    // be observed — mutating the mock alone would leave a stale closure.
    navigateTo(next: string) {
      mockPathname = next
      result.rerender(
        <NextIntlClientProvider locale="fr" messages={fr}>{tree()}</NextIntlClientProvider>,
      )
    },
  }
}

const bubble = () => within(screen.getByRole('dialog'))
const startTour = () => fireEvent.click(screen.getByRole('button', { name: 'Commencer' }))

beforeEach(() => {
  push.mockClear()
  setTourState.mockClear()
})

describe('the invitation card', () => {
  it('is offered to a pending organizer on /applications', () => {
    renderShell()
    expect(screen.getByText('Découvrez EazyExchange en 2 minutes')).toBeInTheDocument()
  })

  it('is not offered anywhere else, so it appears once where it is contextual', () => {
    renderShell({ pathname: '/students' })
    expect(screen.queryByText('Découvrez EazyExchange en 2 minutes')).not.toBeInTheDocument()
  })

  it('is not offered again once dismissed', () => {
    renderShell({ tourState: 'dismissed' })
    expect(screen.queryByText('Découvrez EazyExchange en 2 minutes')).not.toBeInTheDocument()
  })

  it('is not offered once completed', () => {
    renderShell({ tourState: 'completed' })
    expect(screen.queryByText('Découvrez EazyExchange en 2 minutes')).not.toBeInTheDocument()
  })

  it('« Plus tard » records the dismissal and never opens the tour', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(setTourState).toHaveBeenCalledWith('dismissed')
    expect(screen.queryByText('Découvrez EazyExchange en 2 minutes')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hides while the tour is running', () => {
    renderShell()
    startTour()
    expect(screen.queryByText('Découvrez EazyExchange en 2 minutes')).not.toBeInTheDocument()
  })
})

describe('walking the tour', () => {
  it('opens on the welcome step, unanchored, with no route change', () => {
    renderShell()
    startTour()
    expect(bubble().getByText('Bienvenue dans EazyExchange')).toBeInTheDocument()
    expect(bubble().getByText('1 / 8')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    // First step: nothing to go back to.
    expect(screen.queryByRole('button', { name: 'Précédent' })).not.toBeInTheDocument()
  })

  it('navigates to each tab as it advances', () => {
    renderShell()
    startTour()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(bubble().getByText('Candidatures')).toBeInTheDocument()
    // Already on /applications, so there is nothing to push yet.
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(bubble().getByText('Fichiers')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/forms')
  })

  it('goes back', () => {
    renderShell()
    startTour()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(bubble().getByText('Bienvenue dans EazyExchange')).toBeInTheDocument()
  })

  it('offers Terminer on the last step and records completion', () => {
    renderShell()
    startTour()
    for (let i = 0; i < TOUR_STEPS.length - 2; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(bubble().getByText('8 / 8')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Suivant' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }))
    expect(setTourState).toHaveBeenCalledWith('completed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Passer closes the tour and records a dismissal', () => {
    renderShell()
    startTour()
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }))
    expect(setTourState).toHaveBeenCalledWith('dismissed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('returns the organizer to where they opened it', () => {
    const { navigateTo } = renderShell()
    startTour()
    // Walk far enough to leave /applications, following the route for real.
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    navigateTo('/forms')
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }))
    expect(push).toHaveBeenLastCalledWith('/applications')
  })

  it('swallows clicks on the app behind instead of navigating', () => {
    renderShell()
    startTour()
    const swallow = screen.getByTestId('tour-swallow')
    fireEvent.click(swallow)
    // Inert on purpose: a mis-click must not end the tour either.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(setTourState).not.toHaveBeenCalled()
  })
})

describe('missing anchors', () => {
  it('skips the tabs that are not rendered without an exchange', () => {
    renderShell({ withExchange: false })
    startTour()
    // Only welcome, Aperçu, Réglages and finish have anchors on screen.
    expect(bubble().getByText('1 / 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(bubble().getByText('Aperçu')).toBeInTheDocument()
    expect(push).toHaveBeenCalledWith('/dashboard')
  })
})

describe('the account menu entry', () => {
  it('replays the tour after it was completed', () => {
    renderShell({ tourState: 'completed', pathname: '/students' })
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visite guidée' }))
    expect(bubble().getByText('Bienvenue dans EazyExchange')).toBeInTheDocument()
  })
})
