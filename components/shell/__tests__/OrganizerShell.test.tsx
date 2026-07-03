import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let mockPathname = '/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, phase: 1 as const }]

function renderShell({ pathname = '/dashboard' }: { pathname?: string } = {}) {
  mockPathname = pathname
  return render(
    <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
      <p>page</p>
    </OrganizerShell>
  )
}

describe('OrganizerShell', () => {
  it('renders the French rail items when an exchange is active', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
    expect(screen.getByText('Candid.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Inviter des élèves/ })).toHaveAttribute(
      'href',
      '/exchanges/ex1#invite'
    )
  })

  it('rail points at the session-scoped top-level routes', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Échanges/ })).toHaveAttribute('href', '/exchanges')
    expect(screen.getByRole('link', { name: /Candid\./ })).toHaveAttribute('href', '/applications')
    expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()
  })

  it('Échanges stays visible with zero exchanges', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Échanges/ })).toBeInTheDocument()
    expect(screen.queryByText('Candid.')).toBeNull()
  })

  it('hides Candid. but offers creation when no exchanges exist', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('Candid.')).toBeNull()
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
  })

  it('shows organizer initials and the session name', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
  })

  it('falls back to the first exchange when activeExchangeId matches none (stale data)', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="stale-id" organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
  })

  it('dismisses the session selector panel on outside click', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" needsSchoolName={false}>
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

  it('shows the contextual search + CTA on /forms instead of the invite button', () => {
    renderShell({ pathname: '/forms' })
    expect(screen.getByPlaceholderText('Rechercher un formulaire…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nouveau formulaire/ })).toBeInTheDocument()
    expect(screen.queryByText(/Inviter des élèves/)).toBeNull()
  })

  it('shows the documents CTA on /documents', () => {
    renderShell({ pathname: '/documents' })
    expect(screen.getByPlaceholderText('Rechercher un document…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Demander un document/ })).toBeInTheDocument()
  })

  it('keeps the invite button elsewhere', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByText(/Inviter des élèves/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Rechercher/)).toBeNull()
  })
})
