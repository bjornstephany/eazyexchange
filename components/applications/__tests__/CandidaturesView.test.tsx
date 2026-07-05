import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const bulkAccept = vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 })
vi.mock('@/actions/applications', () => ({
  acceptApplications: (...a: unknown[]) => bulkAccept(...a),
  rejectApplications: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))
const setApplicationOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/exchanges', () => ({ setApplicationOpen: (...a: unknown[]) => setApplicationOpen(...a) }))
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import type { AppRow } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', data: {}, email: 'r@r.fr' },
]

describe('CandidaturesView', () => {
  it('tabs filter with counts', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
  it('selection reveals the bulk bar and accepts the selection', async () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1]) // first row
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    expect(screen.getByText('2 sélectionnées')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(bulkAccept).toHaveBeenCalledWith(['1', '2'])
  })
  it('row click navigates to the detail', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })
  it('select-all checkbox selects the filtered rows', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('3 sélectionnées')).toBeInTheDocument()
  })
  it('changing the deadline calls setApplicationOpen with the current open state', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-10-01' } })
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', true, '2026-10-01')
  })
  it('the toggle closes applications, keeping the current deadline', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    fireEvent.click(screen.getByRole('button', { name: /Ouvert/ }))
    expect(setApplicationOpen).toHaveBeenCalledWith('ex1', false, '2026-09-01')
  })
  it('clearing the deadline is ignored (never persists a null deadline)', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" exchangeId="ex1" applicationOpen applicationDeadline="2026-09-01" />)
    const callsBefore = setApplicationOpen.mock.calls.length
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '' } })
    expect(setApplicationOpen).toHaveBeenCalledTimes(callsBefore)
  })
})
