import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const openNewExchange = vi.fn()
vi.mock('@/components/shell/ShellUiContext', () => ({
  useShellUi: () => ({ openNewExchange }),
}))

import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

describe('EmptyDashboard', () => {
  it('renders the empty-state title and heading', () => {
    renderWithIntl(<EmptyDashboard />)
    expect(screen.getByText('Tableau de bord')).toBeTruthy()
    expect(screen.getByText(/Aucun .change pour l.instant/)).toBeTruthy()
  })

  it('CTA opens the new-exchange modal', () => {
    renderWithIntl(<EmptyDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /Nouvel .change/ }))
    expect(openNewExchange).toHaveBeenCalledOnce()
  })
})
