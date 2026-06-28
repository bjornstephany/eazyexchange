import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { landingContent } from '@/lib/landing/content'

describe('HowItWorks', () => {
  it('renders every step title', () => {
    render(<HowItWorks />)
    for (const step of landingContent.howItWorks.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument()
    }
  })
})
