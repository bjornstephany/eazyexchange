import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const accept = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/applications-review', () => ({
  acceptApplication: (...a: unknown[]) => accept(...a),
  rejectApplication: vi.fn().mockResolvedValue(undefined),
}))

import { StudentDrawer } from '@/components/dashboard/StudentDrawer'

const app = { id: 'a1', status: 'submitted', submitted_at: '2026-09-12', data: { first_name: 'Léa', last_name: 'Moreau' }, email: 'l@m.fr' }

describe('StudentDrawer', () => {
  it('renders nothing when subject is null', () => {
    const { container } = renderWithIntl(<StudentDrawer subject={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
  it('application subject: timeline + accept action', async () => {
    renderWithIntl(<StudentDrawer subject={{ kind: 'application', app }} onClose={() => {}} />)
    expect(screen.getByText('Parcours')).toBeInTheDocument()
    expect(screen.getByText('Candidature reçue')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Accepter & inviter' }))
    expect(accept).toHaveBeenCalledWith('a1')
  })
  it('reject requires the inline confirm step', () => {
    renderWithIntl(<StudentDrawer subject={{ kind: 'application', app }} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(screen.getByRole('button', { name: 'Confirmer le refus' })).toBeInTheDocument()
  })
  it('student subject: checklist without actions', () => {
    renderWithIntl(<StudentDrawer subject={{ kind: 'student', rollup: { studentId: 's1', name: 'Manon Girard', forms: 'pending', docs: 'missing', due: '2026-10-03', late: true, overall: { kind: 'bad', label: 'En retard' } }, items: [{ label: 'Passeport', group: 'doc', pill: { kind: 'bad', label: 'Manquant' } }] }} onClose={() => {}} />)
    expect(screen.getByText('Passeport')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accepter & inviter' })).toBeNull()
  })
  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    renderWithIntl(<StudentDrawer subject={{ kind: 'application', app }} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
  it('Escape collapses the reject step first, then closes the drawer on a second Escape', () => {
    const onClose = vi.fn()
    renderWithIntl(<StudentDrawer subject={{ kind: 'application', app }} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))
    expect(screen.getByRole('button', { name: 'Confirmer le refus' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Confirmer le refus' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Léa Moreau')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
