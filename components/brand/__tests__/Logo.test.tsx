import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from '@/components/brand/Logo'

describe('Logo', () => {
  it('links home with an accessible name by default', () => {
    render(<Logo />)
    const link = screen.getByRole('link', { name: 'EazyExchange home' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows the wordmark text', () => {
    render(<Logo />)
    expect(screen.getByText('Eazy')).toBeInTheDocument()
    expect(screen.getByText('Exchange')).toBeInTheDocument()
  })

  it('renders no link when href is null', () => {
    render(<Logo href={null} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
