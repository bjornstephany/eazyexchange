import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const openNewExchange = vi.fn()
vi.mock('@/components/shell/ShellUiContext', () => ({
  useShellUi: () => ({ openNewExchange }),
}))

import { EmptyDashboard } from '@/components/dashboard/EmptyDashboard'

describe('EmptyDashboard', () => {
  it('renders the empty-state title and heading', () => {
    render(<EmptyDashboard />)
    expect(screen.getByText('Tableau de bord')).toBeTruthy()
    expect(screen.getByText(/Aucun .change pour l.instant/)).toBeTruthy()
  })

  it('CTA opens the new-exchange modal', () => {
    render(<EmptyDashboard />)
    fireEvent.click(screen.getByRole('button', { name: /Nouvel .change/ }))
    expect(openNewExchange).toHaveBeenCalledOnce()
  })
})
