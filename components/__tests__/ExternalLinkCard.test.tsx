import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExternalLinkCard } from '@/components/ExternalLinkCard'

describe('ExternalLinkCard', () => {
  it('renders a new-tab noopener link labelled from the template name, with the raw URL alongside', () => {
    render(<ExternalLinkCard name="ESTA — autorisation de voyage États-Unis" url="https://esta.cbp.dhs.gov" />)
    const link = screen.getByRole('link', { name: /Faire la demande — ESTA — autorisation de voyage États-Unis/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Raw URL printed alongside so families can verify where the button goes.
    expect(screen.getByText('https://esta.cbp.dhs.gov')).toBeInTheDocument()
  })
})
