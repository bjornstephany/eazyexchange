import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import { UpgradeOptions } from '@/components/billing/UpgradeOptions'

describe('UpgradeOptions', () => {
  it('offers both higher tiers to a starter subscriber, each with its own CTA', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'starter' })}</>)
    expect(screen.getByRole('link', { name: 'Passer à Association' }))
      .toHaveAttribute('href', '/billing/upgrade?plan=growth')
    expect(screen.getByRole('link', { name: 'Passer à Réseau' }))
      .toHaveAttribute('href', '/billing/upgrade?plan=scale')
  })

  it('prices each card by the capacity it adds, not the absolute cap', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'starter' })}</>)
    expect(screen.getByText('+4 échanges')).toBeInTheDocument()
    expect(screen.getAllByText('Échanges illimités').length).toBeGreaterThan(0)
  })

  it('offers only scale to a growth subscriber', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'growth' })}</>)
    expect(screen.getByRole('link', { name: 'Passer à Réseau' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Passer à Association' })).toBeNull()
  })

  it('renders nothing on the top plan', async () => {
    const { container } = renderWithIntl(<>{await UpgradeOptions({ current: 'scale' })}</>)
    expect(container.textContent).toBe('')
  })

  it('shows the shared feature bullets on every card', async () => {
    renderWithIntl(<>{await UpgradeOptions({ current: 'starter' })}</>)
    expect(screen.getAllByText('Relances automatiques par e-mail')).toHaveLength(2)
  })
})
