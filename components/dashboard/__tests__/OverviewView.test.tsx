import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
import de from '@/messages/de.json'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

import { OverviewView } from '@/components/dashboard/OverviewView'
import type { AppRow, DossierRollup, EnrolledStudent } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' },
  { id: '2', status: 'enrolled', submitted_at: '2026-09-10', responded_at: '2026-09-18T12:00:00.000+00:00', data: { first_name: 'Camille', last_name: 'Laurent' }, email: 'c@l.fr' },
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

  it('the review card is a deep link to the Applications page, not a table filter', () => {
    renderWithIntl(<OverviewView {...base} />)
    expect(screen.getByRole('link', { name: 'Examiner' })).toHaveAttribute('href', '/applications?tab=toreview')
    expect(screen.queryByRole('button', { name: 'Examiner' })).toBeNull()
  })

  it('filter-style action cards still filter the table', () => {
    renderWithIntl(<OverviewView {...base} />)
    // `base` is late with missing docs, so the « Relancer » card is a button.
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }))
    expect(screen.getByRole('button', { name: /Filtre :/ })).toBeInTheDocument()
  })

  it('hides rejected/declined rows behind the « Afficher » toggle', () => {
    const closedApps: AppRow[] = [
      ...apps,
      { id: '3', status: 'rejected', submitted_at: '2026-09-01', responded_at: null, data: { first_name: 'Nina', last_name: 'Rey' }, email: 'n@r.fr' },
      { id: '4', status: 'declined', submitted_at: '2026-09-02', responded_at: '2026-09-05T12:00:00.000+00:00', data: { first_name: 'Tom', last_name: 'Vidal' }, email: 't@v.fr' },
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

  it('shows the response date, with the year, beside the pill on the enrolled row', () => {
    renderWithIntl(<OverviewView {...base} />)
    const date = screen.getByTitle('18 septembre 2026')
    expect(date).toHaveTextContent('18 sept. 2026')
  })

  it('renders the response date in the active locale, not French', () => {
    renderWithIntl(<OverviewView {...base} />, { locale: 'de', messages: de })
    expect(screen.getByTitle('18. September 2026')).toHaveTextContent('18. Sept. 2026')
    expect(screen.queryByTitle('18 septembre 2026')).toBeNull()
  })

  it('dates a declined row too — the rule is responded_at, not acceptance', () => {
    const closedApps: AppRow[] = [
      ...apps,
      { id: '4', status: 'declined', submitted_at: '2026-09-02', responded_at: '2026-09-05T12:00:00.000+00:00', data: { first_name: 'Tom', last_name: 'Vidal' }, email: 't@v.fr' },
    ]
    renderWithIntl(<OverviewView {...base} apps={closedApps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les refusés et déclinés (1)' }))
    expect(screen.getByTitle('5 septembre 2026')).toHaveTextContent('5 sept. 2026')
    // Camille's acceptance and Tom's decline — both dated.
    expect(screen.getAllByTitle(/septembre 2026/)).toHaveLength(2)
  })

  it('shows no date while only the organizer has acted (responded_at null)', () => {
    // Léa is `submitted`; the organizer accepting her would not set responded_at
    // either — nothing to date until the invitee replies.
    const pendingApps: AppRow[] = [
      { id: '5', status: 'accepted', submitted_at: '2026-09-02', responded_at: null, data: { first_name: 'Iris', last_name: 'Roux' }, email: 'i@r.fr' },
    ]
    renderWithIntl(<OverviewView {...base} apps={pendingApps} students={[]} rollups={[]} />)
    expect(screen.getByText('Iris Roux')).toBeInTheDocument()
    expect(screen.queryByTitle(/2026/)).toBeNull()
  })

  it('applicant row click navigates to the application page', () => {
    push.mockClear()
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })

  it('enrolled row click opens the checklist drawer — with no application branch', () => {
    renderWithIntl(<OverviewView {...base} />)
    fireEvent.click(screen.getByText('Camille Laurent'))
    expect(screen.getByText(/Formulaires & documents/)).toBeInTheDocument()
    expect(screen.queryByText('Parcours')).toBeNull() // no timeline heading
    expect(screen.queryByRole('button', { name: 'Accepter & inviter' })).toBeNull()
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

  it('empty state offers exactly one CTA: a link to the Applications page', () => {
    renderWithIntl(<OverviewView {...base} apps={[]} students={[]} rollups={[]} applicationOpen={false} applicationDeadline={null} />)
    expect(screen.getByRole('link', { name: 'Aller aux candidatures' })).toHaveAttribute('href', '/applications')
    expect(screen.queryByRole('link', { name: /Préparer les formulaires & documents/ })).toBeNull()
    expect(screen.getByText('Commencez votre échange en invitant vos élèves à postuler.')).toBeInTheDocument()
  })

  it('gives the lifecycle table a column gap so the pill never touches the next column', () => {
    const { container } = renderWithIntl(<OverviewView {...base} />)
    const header = container.querySelector('.grid-cols-\\[1\\.7fr_1\\.15fr_1fr_1fr_1fr_22px\\]')
    expect(header?.className).toContain('gap-x-5')
  })
})
