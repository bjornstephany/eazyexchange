import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Features } from '@/components/landing/Features'
import { landingContent } from '@/lib/landing/content'

describe('Features', () => {
  it('renders a card for every feature item', () => {
    render(<Features />)
    for (const item of landingContent.features.items) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
      expect(screen.getByText(item.description)).toBeInTheDocument()
    }
  })
})
