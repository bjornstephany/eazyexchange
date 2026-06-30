import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LandingNav } from '@/components/landing/LandingNav'

describe('LandingNav', () => {
  it('shows the brand and links log in / get started correctly', () => {
    render(<LandingNav />)
    expect(screen.getByRole('link', { name: 'EazyExchange home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
  })
})
