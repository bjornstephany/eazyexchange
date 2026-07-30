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
import { TourProvider } from '@/components/tour/TourProvider'

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

beforeEach(() => {
  push.mockClear()
  setTourState.mockClear()
})

describe('the tour opens by itself', () => {
  it('opens for an organizer who has never seen it, without being asked', () => {
    renderShell()
    expect(bubble().getByText('Bienvenue dans EazyExchange ! 🎉')).toBeInTheDocument()
  })

  it('opens wherever they land, not only on /applications', () => {
    renderShell({ pathname: '/students' })
    expect(bubble().getByText('Bienvenue dans EazyExchange ! 🎉')).toBeInTheDocument()
  })

  it('does not open again once dismissed', () => {
    renderShell({ tourState: 'dismissed' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open once completed', () => {
    renderShell({ tourState: 'completed' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not reopen once skipped, even after a route change', () => {
    // initialState is still 'pending' — the server has not re-rendered — so the
    // only thing standing between the organizer and an infinite tour is the ref.
    const { navigateTo } = renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }))
    navigateTo('/students')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open a tour that would be nothing but welcome and finish', () => {
    // No sidebar, so no data-tour anchors at all: every anchored step filters
    // out and only the two unanchored ones remain. Not worth an interruption,
    // and the state stays pending so a later visit can still offer it.
    renderWithIntl(
      <TourProvider initialState="pending"><p>page</p></TourProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('walking the tour', () => {
  it('opens on the welcome step, unanchored, with no route change', () => {
    renderShell()
    expect(bubble().getByText('Bienvenue dans EazyExchange ! 🎉')).toBeInTheDocument()
    expect(bubble().getByText('1 / 8')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    // First step: nothing to go back to.
    expect(screen.queryByRole('button', { name: 'Précédent' })).not.toBeInTheDocument()
  })

  it('navigates to each tab as it advances', () => {
    renderShell()
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
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(bubble().getByText('Bienvenue dans EazyExchange ! 🎉')).toBeInTheDocument()
  })

  it('offers Terminer on the last step and records completion', () => {
    renderShell()
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
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }))
    expect(setTourState).toHaveBeenCalledWith('dismissed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('returns the organizer to where they opened it', () => {
    const { navigateTo } = renderShell()
    // Walk far enough to leave /applications, following the route for real.
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    navigateTo('/forms')
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }))
    expect(push).toHaveBeenLastCalledWith('/applications')
  })

  it('swallows clicks on the app behind instead of navigating', () => {
    renderShell()
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
    expect(bubble().getByText('Bienvenue dans EazyExchange ! 🎉')).toBeInTheDocument()
  })
})
