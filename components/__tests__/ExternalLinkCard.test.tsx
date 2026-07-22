import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import { ExternalLinkCard } from '@/components/ExternalLinkCard'

describe('ExternalLinkCard', () => {
  it('renders a new-tab noopener link labelled from the template name, with the raw URL alongside', async () => {
    renderWithIntl(
      <>{await ExternalLinkCard({ name: 'ESTA — autorisation de voyage États-Unis', url: 'https://esta.cbp.dhs.gov' })}</>,
    )
    const link = screen.getByRole('link', { name: /Faire la demande — ESTA — autorisation de voyage États-Unis/ })
    expect(link).toHaveAttribute('href', 'https://esta.cbp.dhs.gov')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Raw URL printed alongside so families can verify where the button goes.
    expect(screen.getByText('https://esta.cbp.dhs.gov')).toBeInTheDocument()
  })

  it('renders nothing for a non-https URL (stored-XSS defense-in-depth)', async () => {
    const { container } = renderWithIntl(<>{await ExternalLinkCard({ name: 'ESTA', url: 'javascript:alert(1)' })}</>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})
