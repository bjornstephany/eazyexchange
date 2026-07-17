import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import fr from '@/messages/fr.json'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('@/actions/applications-review', () => ({ acceptApplication: vi.fn(), rejectApplication: vi.fn() }))
vi.mock('@/components/dashboard/InviteModal', () => ({
  InviteModal: ({ open }: { open: boolean }) => (open ? <div>invite-modal</div> : null),
}))

import { OverviewView } from '@/components/dashboard/OverviewView'
import type { AppRow, DossierRollup, EnrolledStudent } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
]
const students: EnrolledStudent[] = [{ id: 's1', full_name: 'Camille Laurent', email: 'c@l.fr' }]
const rollups: DossierRollup[] = [{
  studentId: 's1', name: 'Camille Laurent', forms: 'pending', docs: 'missing',
  due: '2026-10-03', late: true, overall: { kind: 'bad', label: 'En retard' },
}]
const base = {
  exchangeId: 'ex1', apps, students, rollups, templates: [], cellMap: {},
  applicationOpen: true, applicationDeadline: '2026-09-01' as string | null, applySlug: 'france-canada',
}

describe('OverviewView — unified lifecycle table', () => {
  it('renders heading, unified funnel and one row per person (dedupe by email)', () => {
    renderWithIntl(<OverviewView {...base} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.getByText('Candidatures')).toBeInTheDocument()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    // enrolled app c@l.fr merged into the student row: exactly one Camille row
    expect(screen.getAllByText('Camille Laurent')).toHaveLength(1)
    expect(screen.getByText('Accepté(e)')).toBeInTheDocument()
    // enrolled row shows rollup pills, applicant row shows dashes
    expect(screen.getByText('En cours')).toBeInTheDocument()   // formsPill(pending)
    expect(screen.getByText('Manquant')).toBeInTheDocument()   // docsPill(missing)
  })

  it('Complets tile reads « x / y »', () => {
    renderWithIntl(<OverviewView {...base} />)
    expect(screen.getByRole('button', { name: /0 \/ 1\s*Complets/ })).toBeInTheDocument()
  })

  it('funnel tile filters the table and shows a dismissible chip', () => {
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByRole('button', { name: /À examiner/ }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Filtre :/ }))
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })

  it('action card click applies its filter', () => {
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Examiner' }))
    expect(screen.queryByText('Camille Laurent')).toBeNull()
  })

  it('hides rejected/declined rows behind the « Afficher » toggle', () => {
    const closedApps: AppRow[] = [
      ...apps,
      { id: '3', status: 'rejected', submitted_at: '2026-09-01', data: { first_name: 'Nina', last_name: 'Rey' }, email: 'n@r.fr' },
      { id: '4', status: 'declined', submitted_at: '2026-09-02', data: { first_name: 'Tom', last_name: 'Vidal' }, email: 't@v.fr' },
    ]
    renderWithIntl(<OverviewView {...base} apps={closedApps} />)
    expect(screen.queryByText('Nina Rey')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Afficher les refusés et déclinés (2)' })
    fireEvent.click(toggle)
    expect(screen.getByText('Nina Rey')).toBeInTheDocument()
    expect(screen.getByText('Tom Vidal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Masquer les refusés et déclinés' }))
    expect(screen.queryByText('Nina Rey')).toBeNull()
  })

  it('row click opens the right drawer per row kind', () => {
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(screen.getByText('Parcours')).toBeInTheDocument() // application timeline
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    fireEvent.click(screen.getByText('Camille Laurent'))
    expect(screen.getByText(/Formulaires & documents/)).toBeInTheDocument() // student checklist
  })

  it('right rail has action cards but no reminder note and no phase stepper', () => {
    renderWithIntl(<OverviewView {...base} />)
    expect(screen.getByText('À faire maintenant')).toBeInTheDocument()
    expect(screen.queryByText(/Relance automatique demain 8h/)).toBeNull()
    expect(screen.queryByText(/Phase/)).toBeNull()
  })

  it('shows the no-active-forms card linking to /forms when there are no active templates', () => {
    renderWithIntl(<OverviewView {...base} />)
    expect(screen.getByText('Aucun formulaire actif')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer les formulaires' })).toHaveAttribute('href', '/forms')
  })

  it('shows the empty-state CTA only when applications never opened AND nobody exists', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('heading', { name: /Commencez votre échange/ })).toBeInTheDocument()
    expect(screen.queryByText("Vue d'ensemble")).toBeNull()
  })

  it('shows the normal overview once applications are open, even with nobody yet', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Commencez votre échange/ })).toBeNull()
  })

  it('directly-invited students suppress the empty state even if applications never opened', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument()
    expect(screen.getByText('Camille Laurent')).toBeInTheDocument()
  })

  it('CTA opens the invite modal', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })

  it('empty state offers both CTAs: invite (primary) and prepare forms & documents (link to /forms)', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer les formulaires & documents' })).toHaveAttribute('href', '/forms')
  })

  it('keeps the invite modal mounted when opening applications flips neverOpened', () => {
    const { rerender } = renderWithIntl(
      <OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Inviter vos élèves à postuler/ }))
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
    rerender(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen applicationDeadline="2026-09-01" />
      </NextIntlClientProvider>
    )
    expect(screen.getByText('invite-modal')).toBeInTheDocument()
  })
})
