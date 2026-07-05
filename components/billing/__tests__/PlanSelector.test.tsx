import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanSelector } from '@/components/billing/PlanSelector'

describe('PlanSelector', () => {
  it('pre-selects growth (Association) with a POPULAIRE pill', () => {
    render(<PlanSelector />)
    expect(screen.getByText('POPULAIRE')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continuer avec Association/i })).toBeInTheDocument()
  })
  it('updates the CTA when another plan is picked', async () => {
    const user = userEvent.setup()
    render(<PlanSelector />)
    await user.click(screen.getByText('Essentiel'))
    expect(screen.getByRole('link', { name: /continuer avec Essentiel/i })).toBeInTheDocument()
  })
  it('shows the yearly price for each tier', () => {
    render(<PlanSelector />)
    expect(screen.getByText('199 €')).toBeInTheDocument()
    expect(screen.getByText('499 €')).toBeInTheDocument()
    expect(screen.getByText('799 €')).toBeInTheDocument()
  })
})
