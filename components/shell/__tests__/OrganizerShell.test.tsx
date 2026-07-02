import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/actions/session', () => ({ setActiveExchange: vi.fn() }))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))

import { OrganizerShell } from '@/components/shell/OrganizerShell'

const exchanges = [{ id: 'ex1', name: 'France–Canada 2026', year: 2026 }]

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

  it('hides exchange-scoped items and offers creation when no exchanges exist', () => {
    render(
      <OrganizerShell exchanges={[]} activeExchangeId={null} organizerName="Marie Bernard" needsSchoolName={false}>
        <p>page</p>
      </OrganizerShell>
    )
    expect(screen.queryByText('Échanges')).toBeNull()
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
})
