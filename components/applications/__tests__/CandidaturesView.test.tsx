import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const bulkAccept = vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 })
vi.mock('@/actions/applications-review', () => ({
  acceptApplications: (...a: unknown[]) => bulkAccept(...a),
  rejectApplications: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))
const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a) }))
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import type { AppRow } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français', sex: 'female' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', responded_at: null, data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', responded_at: null, data: {}, email: 'r@r.fr' },
]

describe('CandidaturesView', () => {
  it('tabs filter with counts', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
  it('selection reveals the bulk bar and accepts the selection', async () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1]) // first row
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    expect(screen.getByText('2 sélectionnées')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(bulkAccept).toHaveBeenCalledWith(['1', '2'])
  })
  it('row click navigates to the detail', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })
  it('select-all checkbox selects the filtered rows', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('3 sélectionnées')).toBeInTheDocument()
  })
  it('changing the deadline calls setApplicationOpen with the current open state', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '2026-10-01' } })
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-10-01')
  })
  it('the toggle closes applications, keeping the current deadline', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByRole('button', { name: /Ouvert/ }))
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', false, '2026-09-01')
  })
  it('clearing the deadline is ignored (never persists a null deadline)', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    const callsBefore = setApplicationOpen.mock.calls.length
    fireEvent.change(screen.getByLabelText('Date limite'), { target: { value: '' } })
    expect(setApplicationOpen).toHaveBeenCalledTimes(callsBefore)
  })
  it('shows a Gender column with the localized label, not Native language', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    expect(screen.getByText('Genre')).toBeInTheDocument()
    expect(screen.queryByText('Langue mat.')).toBeNull()
    // Stored token 'female' renders as its French label…
    expect(screen.getByText('Fille')).toBeInTheDocument()
    // …and the native language value is gone from the table entirely.
    expect(screen.queryByText('Français')).toBeNull()
  })
  it('keeps declined out of the Rejected tab and gives it its own', () => {
    const tabApps: AppRow[] = [
      { id: 'r', status: 'rejected', submitted_at: '2026-09-01', responded_at: null, data: { first_name: 'Rita', last_name: 'Refus' }, email: 'r@x.fr' },
      { id: 'd', status: 'declined', submitted_at: '2026-09-02', responded_at: null, data: { first_name: 'Diane', last_name: 'Desist' }, email: 'd@x.fr' },
    ]
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.getByText('Rita Refus')).toBeInTheDocument()
    expect(screen.queryByText('Diane Desist')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Désistements/ }))
    expect(screen.getByText('Diane Desist')).toBeInTheDocument()
    expect(screen.queryByText('Rita Refus')).toBeNull()
  })
  it('splits organizer-accepted (En attente) from student-confirmed (Acceptées)', () => {
    const tabApps: AppRow[] = [
      { id: 'a', status: 'accepted', submitted_at: '2026-09-01', responded_at: null, data: { first_name: 'Alex', last_name: 'Attente' }, email: 'a@x.fr' },
      { id: 'm', status: 'maybe', submitted_at: '2026-09-02', responded_at: null, data: { first_name: 'Manon', last_name: 'Peutetre' }, email: 'm@x.fr' },
      { id: 'e', status: 'enrolled', submitted_at: '2026-09-03', responded_at: null, data: { first_name: 'Enzo', last_name: 'Inscrit' }, email: 'e@x.fr' },
    ]
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" applySlug="espagne-2026" />)
    fireEvent.click(screen.getByRole('button', { name: /En attente/ }))
    expect(screen.getByText('Alex Attente')).toBeInTheDocument()
    expect(screen.getByText('Manon Peutetre')).toBeInTheDocument()
    expect(screen.queryByText('Enzo Inscrit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Acceptées/ }))
    expect(screen.getByText('Enzo Inscrit')).toBeInTheDocument()
    expect(screen.queryByText('Alex Attente')).toBeNull()
  })
})
