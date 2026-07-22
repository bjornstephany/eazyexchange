import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('next-intl/server', async () =>
  (await import('@/lib/test/serverTranslations')).serverTranslationsMock)

import { LoadingState } from '@/components/LoadingState'

describe('LoadingState', () => {
  it('renders the wordmark and the loading caption', async () => {
    renderWithIntl(await LoadingState())
    expect(screen.getByText('Eazyexchange')).toBeTruthy()
    expect(screen.getByText(/CHARGEMENT DE VOTRE ESPACE/)).toBeTruthy()
  })
})
