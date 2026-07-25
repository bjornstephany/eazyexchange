import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentWarningBanner } from '@/components/billing/PaymentWarningBanner'

describe('PaymentWarningBanner', () => {
  it('renders the strings it is given, in any language', () => {
    render(<PaymentWarningBanner body="Mettez à jour votre carte." cta="Mettre à jour ma carte" />)
    expect(screen.getByText('Mettez à jour votre carte.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Mettre à jour ma carte' })
    expect(link).toHaveAttribute('href', '/billing/portal')
  })

  it('carries no hardcoded English copy', () => {
    const { container } = render(<PaymentWarningBanner body="Kartendaten aktualisieren." cta="Karte aktualisieren" />)
    expect(container.textContent).not.toContain('Your last payment failed')
    expect(container.textContent).not.toContain('Update payment')
  })
})
