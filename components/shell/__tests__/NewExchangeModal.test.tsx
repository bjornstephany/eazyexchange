import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/actions/exchanges', () => ({ createExchange: vi.fn() }))

import { NewExchangeModal } from '@/components/shell/NewExchangeModal'

describe('NewExchangeModal', () => {
  it('renders the French form', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName={false} />)
    expect(screen.getByText('Nouvel échange')).toBeInTheDocument()
    expect(screen.getByLabelText("Nom de l'échange")).toBeInTheDocument()
    expect(screen.getByLabelText('Année')).toBeInTheDocument()
    expect(screen.getByLabelText('Établissement partenaire')).toBeInTheDocument()
    expect(screen.queryByLabelText('Votre établissement')).toBeNull()
    expect(screen.getByRole('button', { name: "Créer l'échange" })).toBeInTheDocument()
  })

  it('shows the school-name field when needed', () => {
    render(<NewExchangeModal open onOpenChange={() => {}} needsSchoolName />)
    expect(screen.getByLabelText('Votre établissement')).toBeInTheDocument()
  })
})
