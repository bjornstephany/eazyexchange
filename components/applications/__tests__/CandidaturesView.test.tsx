import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
const bulkAccept = vi.fn().mockResolvedValue({ succeeded: 2, failed: 0 })
vi.mock('@/actions/applications', () => ({
  acceptApplications: (...a: unknown[]) => bulkAccept(...a),
  rejectApplications: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))
import { CandidaturesView } from '@/components/applications/CandidaturesView'
import type { AppRow } from '@/lib/dashboard/rollup'

const apps: AppRow[] = [
  { id: '1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau', grade: 'Première', native_language: 'Français' }, email: 'l@m.fr' },
  { id: '2', status: 'submitted', submitted_at: '2026-09-13', data: { first_name: 'Hugo', last_name: 'Petit' }, email: 'h@p.fr' },
  { id: '3', status: 'rejected', submitted_at: '2026-09-10', data: {}, email: 'r@r.fr' },
]

describe('CandidaturesView', () => {
  it('tabs filter with counts', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Refusées/ }))
    expect(screen.queryByText('Léa Moreau')).toBeNull()
  })
  it('selection reveals the bulk bar and accepts the selection', async () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    fireEvent.click(screen.getAllByRole('checkbox')[1]) // first row
    fireEvent.click(screen.getAllByRole('checkbox')[2])
    expect(screen.getByText('2 sélectionnées')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(bulkAccept).toHaveBeenCalledWith(['1', '2'])
  })
  it('row click navigates to the detail', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    fireEvent.click(screen.getByText('Léa Moreau'))
    expect(push).toHaveBeenCalledWith('/applications?id=1')
  })
  it('select-all checkbox selects the filtered rows', () => {
    render(<CandidaturesView apps={apps} exchangeName="Espagne" />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('3 sélectionnées')).toBeInTheDocument()
  })
})
