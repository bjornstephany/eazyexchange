import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pricing } from '@/components/landing/Pricing'
import { landingContent } from '@/lib/landing/content'

describe('Pricing', () => {
  it('renders each tier name and a signup CTA per tier', () => {
    render(<Pricing />)
    for (const tier of landingContent.pricing.tiers) {
      expect(screen.getByText(tier.name)).toBeInTheDocument()
    }
    const ctas = screen.getAllByRole('link', { name: 'Get started' })
    expect(ctas.length).toBe(landingContent.pricing.tiers.length)
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/signup'))
  })
})
