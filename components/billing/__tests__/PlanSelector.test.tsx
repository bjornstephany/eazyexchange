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
  it('exposes the cards as a keyboard-operable radiogroup', async () => {
    const user = userEvent.setup()
    render(<PlanSelector />)
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    // Growth pre-selected → it is the checked radio and the sole tab stop.
    const growth = screen.getByRole('radio', { checked: true })
    growth.focus()
    // Arrow key moves selection to the next card (growth → scale) and updates the CTA.
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('link', { name: /continuer avec Réseau/i })).toBeInTheDocument()
  })
  it('shows the yearly price for each tier', () => {
    render(<PlanSelector />)
    expect(screen.getByText('199 €')).toBeInTheDocument()
    expect(screen.getByText('499 €')).toBeInTheDocument()
    expect(screen.getByText('799 €')).toBeInTheDocument()
  })
  it('shows an audience line for each plan and the shared feature bullets', () => {
    render(<PlanSelector />)
    expect(screen.getByText('Pour un jumelage unique')).toBeInTheDocument()
    expect(screen.getByText('Pour plusieurs programmes en parallèle')).toBeInTheDocument()
    expect(screen.getByText('Pour les grands établissements')).toBeInTheDocument()
    // Bullets are identical across the three cards → one per plan.
    expect(screen.getAllByText('Relances automatiques par e-mail')).toHaveLength(3)
  })
})
