import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { landingContent } from '@/lib/landing/content'

describe('LandingFooter', () => {
  it('renders the brand and footer links', () => {
    render(<LandingFooter />)
    expect(
      screen.getByText(`© ${new Date().getFullYear()} ${landingContent.footer.copyright}`)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
