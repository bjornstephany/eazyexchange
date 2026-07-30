import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const bulkAccept = vi.fn().mockResolvedValue({ succeeded: 2, failed: 0, blocked: null })
vi.mock('@/actions/applications-review', () => ({
  acceptApplications: (...a: unknown[]) => bulkAccept(...a),
  rejectApplications: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, blocked: null }),
}))
const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a) }))
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import type { AppRow } from '@/lib/dashboard/rollup'

// The DateField day-cell's accessible name is the full date, not a bare
// number — computed independently of lib/dates so this isn't circular.
function longFr(iso: string) {
  return new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${iso}T00:00:00`))
}

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', responded_at: null, data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français', sex: 'female' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', responded_at: null, data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', responded_at: null, data: {}, email: 'r@r.fr' },
]

describe('CandidaturesView', () => {
  it('tabs filter with counts', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
  it('selection reveals the bulk bar and accepts the selection', async () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1]) // first row
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    expect(screen.getByText('2 sélectionnées')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(bulkAccept).toHaveBeenCalledWith(['1', '2'])
  })
  // 30 blocked candidates have one cause and one fix, so the bar explains it
  // once — and drops the failure tally, which would only repeat it more vaguely.
  it('reports a blocked batch once, with the missing values', async () => {
    bulkAccept.mockResolvedValueOnce({
      succeeded: 0, failed: 2,
      blocked: { missing: ['participation_cost'], literal: false },
    })
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(await screen.findByText(/Bonne nouvelle » incomplet/)).toBeInTheDocument()
    expect(screen.getByText('Participation aux frais')).toBeInTheDocument()
    expect(screen.queryByText(/en échec/)).toBeNull()
  })

  it('row click navigates to the detail', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })
  it('select-all checkbox selects the filtered rows', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('3 sélectionnées')).toBeInTheDocument()
  })
  // Nothing in the redesign ever writes application_open = false. Closing
  // applications early means setting a past deadline, and this line is where
  // that happens — so it always saves `true`, which also self-repairs a legacy
  // exchange left closed.
  it('changing the deadline always saves applications as open', async () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: `Date limite ${longFr('2026-09-01')}` }))
    fireEvent.click(screen.getByRole('button', { name: longFr('2026-09-20') }))
    await waitFor(() => expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-09-20'))
  })

  it('a failed save rolls the date back and says so', async () => {
    setApplicationOpen.mockRejectedValueOnce(new Error('boom'))
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: `Date limite ${longFr('2026-09-01')}` }))
    fireEvent.click(screen.getByRole('button', { name: longFr('2026-09-20') }))
    expect(await screen.findByText('Impossible d’enregistrer la date limite. Réessayez.')).toBeInTheDocument()
    // Rolled back, so re-picking the SAME date still fires a fresh onChange.
    expect(screen.getByRole('button', { name: `Date limite ${longFr('2026-09-01')}` })).toBeInTheDocument()
  })

  it('carries no invitation panel, no open/closed toggle and no questionnaire card', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    expect(screen.queryByText('Candidatures ouvertes')).toBeNull()
    expect(screen.queryByRole('button', { name: /Ouvert/ })).toBeNull()
    expect(screen.queryByText(/Questionnaire de candidature/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Inviter par e-mail' })).toBeNull()
  })

  it('renders the deadline line with a placeholder when the exchange has no deadline', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline={null} />)
    expect(screen.getByRole('button', { name: 'Date limite Choisir une date' })).toBeInTheDocument()
  })
  it('shows a Gender column with the localized label, not Native language', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
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
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
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
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: /En attente/ }))
    expect(screen.getByText('Alex Attente')).toBeInTheDocument()
    expect(screen.getByText('Manon Peutetre')).toBeInTheDocument()
    expect(screen.queryByText('Enzo Inscrit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Acceptées/ }))
    expect(screen.getByText('Enzo Inscrit')).toBeInTheDocument()
    expect(screen.queryByText('Alex Attente')).toBeNull()
  })

  it('the Invités tab shows invited and started rows only', () => {
    const tabApps = [
      { id: '1', status: 'invited', submitted_at: null, responded_at: null, data: { email: 'a@x.co' }, email: 'a@x.co' },
      { id: '2', status: 'draft', submitted_at: null, responded_at: null, data: { email: 'b@x.co' }, email: 'b@x.co' },
      { id: '3', status: 'submitted', submitted_at: '2026-01-01', responded_at: null, data: { email: 'c@x.co' }, email: 'c@x.co' },
    ] as AppRow[]
    renderWithIntl(<CandidaturesView apps={tabApps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByText('Invités'))
    expect(screen.getByText('a@x.co')).toBeTruthy()
    expect(screen.getByText('b@x.co')).toBeTruthy()
    expect(screen.queryByText('c@x.co')).toBeNull()
  })

  it('honours initialTab', () => {
    renderWithIntl(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationDeadline="2026-09-01" initialTab="rejected" />)
    expect(screen.getByText('r@r.fr')).toBeInTheDocument()
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
})
