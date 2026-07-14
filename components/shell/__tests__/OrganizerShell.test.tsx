import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let mockPathname = '/dashboard'
const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))
vi.mock('@/components/shell/FeedbackModal', () => ({
  FeedbackModal: ({ open }: { open: boolean }) => (open ? <div>feedback-modal-open</div> : null),
}))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: false }]

function renderShell({ pathname = '/dashboard' }: { pathname?: string } = {}) {
  mockPathname = pathname
  return render(
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
  it('renders the French rail items when an exchange is active', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
    expect(screen.getByText('Candid.')).toBeInTheDocument()
  })

  it('rail points at the session-scoped top-level routes', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Échanges/ })).toHaveAttribute('href', '/exchanges')
    expect(screen.getByRole('link', { name: /Candid\./ })).toHaveAttribute('href', '/applications')
  })

  it('Échanges stays visible with zero exchanges', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Échanges/ })).toBeInTheDocument()
    expect(screen.queryByText('Candid.')).toBeNull()
  })

  it('hides Candid. but offers creation when no exchanges exist', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('Candid.')).toBeNull()
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
  })

  it('+ Nouvel échange redirects to /billing at cap instead of opening the modal', () => {
    push.mockClear()
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral" atCap>
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /Nouvel échange/ }))
    expect(push).toHaveBeenCalledWith('/billing')
    // The creation dialog must not open.
    expect(screen.queryByText('Donnez un nom à votre échange pour commencer.')).toBeNull()
  })

  it('+ Nouvel échange opens the modal when under cap', () => {
    push.mockClear()
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByRole('button', { name: /Nouvel échange/ }))
    expect(push).not.toHaveBeenCalledWith('/billing')
    expect(screen.getByText('Donnez un nom à votre échange pour commencer.')).toBeInTheDocument()
  })

  it('shows organizer initials and the session name', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
  })

  it('falls back to the first exchange when activeExchangeId matches none (stale data)', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="stale-id" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
  })

  it('dismisses the session selector panel on outside click', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    fireEvent.click(screen.getByText('France–Canada 2026'))
    expect(screen.getByText('+ Nouvel échange')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('+ Nouvel échange')).toBeNull()
  })

  it('shows Formul. and Docs rail items when an exchange is active', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText('Formul.')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('Formul.').closest('a')).toHaveAttribute('href', '/forms')
    expect(screen.getByText('Docs').closest('a')).toHaveAttribute('href', '/documents')
  })

  it('shows no top-bar search or create button on /forms', () => {
    renderShell({ pathname: '/forms' })
    expect(screen.queryByPlaceholderText('Rechercher un formulaire…')).toBeNull()
    expect(screen.queryByRole('button', { name: /Nouveau formulaire/ })).toBeNull()
  })

  it('shows no top-bar search or create button on /documents', () => {
    renderShell({ pathname: '/documents' })
    expect(screen.queryByPlaceholderText('Rechercher un document…')).toBeNull()
    expect(screen.queryByRole('button', { name: /Demander un document/ })).toBeNull()
  })

  it('shows no invite button on /dashboard', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
  })

  it('shows the school name and no session controls on /settings', () => {
    renderShell({ pathname: '/settings' })
    expect(screen.getByText('Lycée Mistral')).toBeInTheDocument()
    expect(screen.queryByText('France–Canada 2026')).toBeNull()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })

  it('shows the students search placeholder and no invite button on /students', () => {
    renderShell({ pathname: '/students' })
    expect(screen.getByPlaceholderText('Rechercher un élève…')).toBeInTheDocument()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })

  it('shows an Archivé pill for an archived active exchange', () => {
    mockPathname = '/dashboard'
    render(
      <OrganizerShell
        exchanges={[{ id: 'ex1', name: 'France–Canada 2026', year: 2026, archived: true }]}
        activeExchangeId="ex1"
        organizerName="Marie Bernard"
        schoolName="Lycée Mistral"
      >
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Archivé')).toBeInTheDocument()
  })

  it('rail contains Élèves but not Réglages when an exchange is active', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByRole('link', { name: /Élèves/ })).toHaveAttribute('href', '/students')
    expect(screen.queryByRole('link', { name: /Réglages/ })).toBeNull()
  })

  it('Réglages lives in the profile menu and links to /settings', () => {
    renderShell({ pathname: '/dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }))
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
  })

  it('shows a Feedback rail button that opens the feedback modal', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral">
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('feedback-modal-open')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Feedback/ }))
    expect(screen.getByText('feedback-modal-open')).toBeInTheDocument()
  })
})
