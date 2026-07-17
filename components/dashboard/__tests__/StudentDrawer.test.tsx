import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

import { StudentDrawer } from '@/components/dashboard/StudentDrawer'

const subject = {
  rollup: {
    studentId: 's1', name: 'Manon Girard', forms: 'pending' as const, docs: 'missing' as const,
    due: '2026-10-03', late: true, overall: { kind: 'bad' as const, label: 'En retard' },
  },
  items: [{ label: 'Passeport', group: 'doc' as const, pill: { kind: 'bad' as const, label: 'Manquant' } }],
}

describe('StudentDrawer', () => {
  it('renders nothing when subject is null', () => {
    const { container } = renderWithIntl(<StudentDrawer subject={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
  it('shows the checklist with name, overall status and items', () => {
    renderWithIntl(<StudentDrawer subject={subject} onClose={() => {}} />)
    expect(screen.getByText('Manon Girard')).toBeInTheDocument()
    expect(screen.getByText('En retard')).toBeInTheDocument()
    expect(screen.getByText('Passeport')).toBeInTheDocument()
    expect(screen.getByText('Manquant')).toBeInTheDocument()
    expect(screen.getByText(/Formulaires & documents/)).toBeInTheDocument()
  })
  it('has no application review UI (timeline, accept/reject)', () => {
    renderWithIntl(<StudentDrawer subject={subject} onClose={() => {}} />)
    expect(screen.queryByText('Parcours')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accepter & inviter' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull()
  })
  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    renderWithIntl(<StudentDrawer subject={subject} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })
  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderWithIntl(<StudentDrawer subject={subject} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
