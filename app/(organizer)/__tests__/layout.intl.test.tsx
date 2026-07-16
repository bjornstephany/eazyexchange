import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useTranslations } from 'next-intl'
import fr from '@/messages/fr.json'

// A minimal consumer proving the provider makes `common` keys resolvable.
function Probe() {
  const t = useTranslations('common')
  return <button>{t('actions.save')}</button>
}

describe('organizer intl provider', () => {
  it('resolves common keys under the provider (fr)', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <Probe />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Enregistrer')).toBeInTheDocument()
  })
})
