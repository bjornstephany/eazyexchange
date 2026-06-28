import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/landing/Hero'
import { landingContent } from '@/lib/landing/content'

describe('Hero', () => {
  it('renders the headline and both CTAs with correct hrefs', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { name: landingContent.hero.headline })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
