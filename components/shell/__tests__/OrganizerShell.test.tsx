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

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, archived: false }]

function renderShell({ pathname = '/dashboard' }: { pathname?: string } = {}) {
  mockPathname = pathname
  return render(
    <OrganizerShell
      exchanges={exchanges}
      activeExchangeId="ex1"
      organizerName="Marie Bernard"
      schoolName="Lycée Mistral"
      needsSchoolName={false}
    >
      <p>page</p>
    </OrganizerShell>
  )
}

describe('OrganizerShell', () => {
  it('renders the French rail items when an exchange is active', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
    expect(screen.getByText('Candid.')).toBeInTheDocument()
  })

  it('rail points at the session-scoped top-level routes', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Échanges/ })).toHaveAttribute('href', '/exchanges')
    expect(screen.getByRole('link', { name: /Candid\./ })).toHaveAttribute('href', '/applications')
    expect(screen.getByText('Phase 1 · Recrutement')).toBeInTheDocument()
  })

  it('Échanges stays visible with zero exchanges', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="M B" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Échanges/ })).toBeInTheDocument()
    expect(screen.queryByText('Candid.')).toBeNull()
  })

  it('hides Candid. but offers creation when no exchanges exist', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('Candid.')).toBeNull()
    expect(screen.getByRole('button', { name: /Nouvel échange/ })).toBeInTheDocument()
  })

  it('shows organizer initials and the session name', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
  })

  it('falls back to the first exchange when activeExchangeId matches none (stale data)', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="stale-id" organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('France–Canada 2026')).toBeInTheDocument()
    expect(screen.getByText('Échanges')).toBeInTheDocument()
  })

  it('dismisses the session selector panel on outside click', () => {
    render(
      <OrganizerShell exchanges={exchanges} activeExchangeId="ex1" organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
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
        exchanges={[{ id: 'ex1', name: 'France–Canada 2026', year: 2026, phase: 1 as const, archived: true }]}
        activeExchangeId="ex1"
        organizerName="Marie Bernard"
        schoolName="Lycée Mistral"
        needsSchoolName={false}
      >
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByText('Archivé')).toBeInTheDocument()
    expect(screen.queryByText('Phase 1 · Recrutement')).toBeNull()
  })

  it('rail contains Élèves and Réglages when an exchange is active', () => {
    renderShell({ pathname: '/dashboard' })
    expect(screen.getByRole('link', { name: /Élèves/ })).toHaveAttribute('href', '/students')
    expect(screen.getByRole('link', { name: /Réglages/ })).toHaveAttribute('href', '/settings')
  })

  it('Réglages stays visible with zero exchanges but Élèves does not', () => {
    mockPathname = '/dashboard'
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" schoolName="Lycée Mistral" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.getByRole('link', { name: /Réglages/ })).toBeInTheDocument()
    expect(screen.queryByText('Élèves')).toBeNull()
  })
})
