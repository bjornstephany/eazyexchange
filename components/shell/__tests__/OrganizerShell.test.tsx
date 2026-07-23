import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

let mockPathname = '/dashboard'
const push = vi.fn()

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
vi.mock('@/components/shell/FeedbackModal', () => ({
  FeedbackModal: ({ open }: { open: boolean }) => (open ? <div>feedback-modal-open</div> : null),
}))

import { setActiveExchange } from '@/actions/session'
import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false }]

function renderShell({ pathname = '/dashboard' }: { pathname?: string } = {}) {
  mockPathname = pathname
  return renderWithIntl(
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId="ex1"
      organizerName="Marie Bernard"
      schoolName="Lycée Mistral"
    >
      <p>page</p>
    </OrganizerShell>
  )
}

describe('OrganizerShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true, writable: true })
  })

  it('renders the French rail items when an exchange is active', () => {
    renderWithIntl(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.queryByText('Échanges')).toBeNull()
    expect(screen.getByText('Candidatures')).toBeInTheDocument()
  })

  it('rail points at the session-scoped top-level routes', () => {
    renderWithIntl(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: 'Candidatures' })).toHaveAttribute('href', '/applications')
  })

  it('only Aperçu stays with zero exchanges', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Aperçu/ })).toBeInTheDocument()
    expect(screen.queryByText('Échanges')).toBeNull()
    expect(screen.queryByText('Candidatures')).toBeNull()
  })

  it('hides Candidatures but offers creation when no exchanges exist', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('Candidatures')).toBeNull()
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
  })

  it('+ Nouvel échange redirects to /billing at cap instead of opening the modal', () => {
    push.mockClear()
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral" atCap>
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /Nouvel échange/ }))
    expect(push).toHaveBeenCalledWith('/billing?reason=limit')
    // The creation dialog must not open.
    expect(screen.queryByText('Donnez un nom à votre échange pour commencer.')).toBeNull()
  })

  it('+ Nouvel échange opens the modal when under cap', () => {
    push.mockClear()
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /Nouvel échange/ }))
    expect(push).not.toHaveBeenCalledWith('/billing?reason=limit')
    expect(screen.getByText('Donnez un nom à votre échange pour commencer.')).toBeInTheDocument()
  })

  it('shows organizer initials and the session name', () => {
    renderWithIntl(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getAllByText('France–Canada 2026').length).toBeGreaterThan(0)
  })

  it('falls back to the first exchange when activeExchangeId matches none (stale data)', () => {
    renderWithIntl(
      <OrganizerShell exchanges={exchanges} activeExchangeId="stale-id" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getAllByText('France–Canada 2026').length).toBeGreaterThan(0)
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
  })

  it('shows one Fichiers rail item pointing at /forms', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Fichiers')).toBeInTheDocument()
    expect(screen.queryByText('Formulaires / Docs')).toBeNull()
    expect(screen.queryByText('Docs')).toBeNull()
    expect(screen.getByText('Fichiers').closest('a')).toHaveAttribute('href', '/forms')
  })

  it('Fichiers is active on both /forms and /documents path prefixes', () => {
    const { unmount } = renderShell({ pathname: '/forms' })
    expect(screen.getByText('Fichiers').closest('a')).toHaveClass('bg-brand-soft')
    unmount()
    renderShell({ pathname: '/documents/t1' })
    expect(screen.getByText('Fichiers').closest('a')).toHaveClass('bg-brand-soft')
  })

  it('shows no top-bar search or create button on /forms', () => {
    renderShell({ pathname: '/forms' })
    expect(screen.queryByPlaceholderText('Rechercher un formulaire…')).toBeNull()
    expect(screen.queryByRole('button', { name: /Nouveau formulaire/ })).toBeNull()
  })

  it('shows no invite button on /dashboard', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
  })

  it('shows the school name and no session controls on /settings', () => {
    renderShell({ pathname: '/settings' })
    expect(screen.getByText('Lycée Mistral')).toBeInTheDocument()
    // The name survives in the sidebar exchange list, but never as the header title.
    expect(screen.queryAllByText('France–Canada 2026')).toHaveLength(1)
    expect(screen.getByText('France–Canada 2026').closest('nav')).not.toBeNull()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })

  it('renders no search input in the shell on /students', () => {
    renderShell({ pathname: '/students' })
    expect(screen.queryByPlaceholderText('Rechercher un élève…')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })

  it('shows an Archivé pill for an archived active exchange', () => {
    mockPathname = '/dashboard'
    renderWithIntl(
      <OrganizerShell
        exchanges={[{ id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: true }]}
        activeExchangeId="ex1"
        organizerName="Marie Bernard"
        schoolName="Lycée Mistral"
      >
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getAllByText('Archivé')).toHaveLength(2)
  })

  it('rail contains a Réglages gear tab linking to /settings', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByRole('link', { name: /Réglages/ })).toHaveAttribute('href', '/settings')
  })

  it('Réglages gear tab is visible even with no exchanges', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Réglages/ })).toHaveAttribute('href', '/settings')
  })

  it('profile menu contains only Se déconnecter, not Réglages', () => {
    renderShell({ pathname: '/dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }))
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
    const menu = screen.getByRole('button', { name: 'Se déconnecter' }).closest('div') as HTMLElement
    expect(within(menu).queryByRole('link', { name: 'Réglages' })).toBeNull()
  })

  it('shows a Feedback button in the header that opens the feedback modal', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText('feedback-modal-open')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Feedback/ }))
    expect(screen.getByText('feedback-modal-open')).toBeInTheDocument()
  })
  it('clicking another exchange switches it and navigates to /dashboard', async () => {
    push.mockClear()
    mockPathname = '/students'
    const two = [
      { id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false },
      { id: 'ex2', name: 'Espagne 2026', year: 2026, archived: false },
    ]
    renderWithIntl(
      <OrganizerShell exchanges={two} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /Espagne 2026/ }))
    await waitFor(() => expect(setActiveExchange).toHaveBeenCalledWith('ex2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('clicking the already-active exchange is a no-op', () => {
    push.mockClear()
    vi.mocked(setActiveExchange).mockClear()
    renderShell({ pathname: '/dashboard' })
    fireEvent.click(screen.getByRole('button', { name: /France–Canada 2026/ }))
    expect(setActiveExchange).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('the sidebar lists Mes échanges with an + Ajouter affordance', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Mes échanges')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('with zero exchanges the sidebar group shows the empty state', () => {
    renderWithIntl(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aucun échange')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Ajouter' })).toBeInTheDocument()
  })

  it('the collapse toggle hides labels and persists the preference', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Candidatures')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réduire' }))
    expect(screen.queryByText('Candidatures')).toBeNull()
    // Accessible names survive collapse.
    expect(screen.getByRole('link', { name: 'Candidatures' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aperçu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Réglages' })).toBeInTheDocument()
    expect(window.localStorage.getItem('ee.sidebar.collapsed')).toBe('true')
  })

  it('a stored collapsed preference renders collapsed on mount', () => {
    window.localStorage.setItem('ee.sidebar.collapsed', 'true')
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText('Candidatures')).toBeNull()
    expect(screen.getByRole('button', { name: 'Développer' })).toBeInTheDocument()
  })
})
