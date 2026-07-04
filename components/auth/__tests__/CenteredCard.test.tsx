import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CenteredCard } from '@/components/auth/CenteredCard'

describe('CenteredCard', () => {
  it('renders the logo wordmark and children inside a card at the given maxWidth', () => {
    const { container } = render(
      <CenteredCard maxWidth={460}><p>card body</p></CenteredCard>,
    )
    expect(screen.getByText('Eazyexchange')).toBeInTheDocument()
    expect(screen.getByText('card body')).toBeInTheDocument()
    const card = container.querySelector('[style*="max-width"]') as HTMLElement
    expect(card).toBeTruthy()
    expect(card.style.maxWidth).toBe('460px')
  })
})
