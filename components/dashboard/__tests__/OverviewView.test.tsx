import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/actions/exchanges', () => ({ setExchangePhase: vi.fn() }))
vi.mock('@/actions/applications-review', () => ({ acceptApplication: vi.fn(), rejectApplication: vi.fn() }))
vi.mock('@/components/dashboard/InviteModal', () => ({
  InviteModal: ({ open }: { open: boolean }) => (open ? <div>invite-modal</div> : null),
}))

import { OverviewView } from '@/components/dashboard/OverviewView'
import type { AppRow } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
]
const base = { exchangeId: 'ex1', apps, rollups: [], templates: [], cellMap: {}, applicationOpen: true, applicationDeadline: '2026-09-01', applySlug: 'france-canada' }

describe('OverviewView phase 1', () => {
  it('renders heading, funnel counts and table rows', () => {
    render(<OverviewView {...base} phase={1} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.getByText('Reçues')).toBeInTheDocument()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    expect(screen.getByText('Confirmé')).toBeInTheDocument()
  })
  it('funnel tile filters the table and shows a dismissible chip', () => {
    render(<OverviewView {...base} phase={1} />)
    fireEvent.click(screen.getByRole('button', { name: /À examiner/ }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Filtre :/ }))
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })
  it('action card click applies its filter', () => {
    render(<OverviewView {...base} phase={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Examiner' }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
  })
  it('action-card-only filter key (maybe) shows a dismissible chip and filters the table', () => {
    const maybeApps: AppRow[] = [
      { id: '1', status: 'maybe', submitted_at: '2026-09-12', data: { first_name: 'Inès', last_name: 'Petit' }, email: 'i@p.fr' },
      { id: '2', status: 'submitted', submitted_at: '2026-09-10', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
    ]
    render(<OverviewView {...base} apps={maybeApps} phase={1} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(screen.getByText('Inès Petit')).toBeInTheDocument()
    expect(screen.queryByText('Camille Laurent')).toBeNull()
    const chip = screen.getByRole('button', { name: /Filtre : Hésitent/ })
    expect(chip).toBeInTheDocument()
    fireEvent.click(chip)
    expect(screen.getByText('Inès Petit')).toBeInTheDocument()
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })

  it('shows the no-active-forms card linking to /forms when there are no active templates', () => {
    render(<OverviewView {...base} phase={1} templates={[]} />)
    expect(screen.getByText('Aucun formulaire actif')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer les formulaires' })).toHaveAttribute('href', '/forms')
  })

  it('shows the empty-state CTA when applications have never opened', () => {
    render(<OverviewView {...base} phase={1} apps={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('heading', { name: /Commencez votre échange/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ })).toBeInTheDocument()
    expect(screen.queryByText("Vue d'ensemble")).toBeNull()
  })

  it('CTA opens the invite modal', () => {
    render(<OverviewView {...base} phase={1} apps={[]} applicationOpen={false} applicationDeadline={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })

  it('shows the normal overview once applications are open, even with zero applicants', () => {
    render(<OverviewView {...base} phase={1} apps={[]} applicationOpen applicationDeadline="2026-09-01" />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.queryByText(/Commencez votre échange/)).toBeNull()
  })

  it('keeps the invite modal mounted when opening applications flips neverOpened', () => {
    // Regression: setApplicationOpen revalidates /dashboard, so the RSC refetch
    // flips applicationOpen/deadline while the modal is showing the one-time link.
    // The modal must survive that flip so the organizer can still copy the link.
    const { rerender } = render(
      <OverviewView {...base} phase={1} apps={[]} applicationOpen={false} applicationDeadline={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()

    rerender(<OverviewView {...base} phase={1} apps={[]} applicationOpen applicationDeadline="2026-09-01" />)
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })
})

describe('OverviewView phase 2', () => {
  it('renders dossier columns from rollups', () => {
    render(<OverviewView {...base} phase={2} rollups={[{ studentId: 's1', name: 'Manon Girard', forms: 'pending', docs: 'missing', due: '2026-10-03', late: true, overall: { kind: 'bad', label: 'En retard' } }]} />)
    expect(screen.getByText('Formulaires')).toBeInTheDocument()
    expect(screen.getByText('Manon Girard')).toBeInTheDocument()
    // 'En retard' legitimately appears twice (funnel stage label + row pill) — assert presence, not uniqueness.
    expect(screen.getAllByText('En retard').length).toBeGreaterThan(0)
  })
})
