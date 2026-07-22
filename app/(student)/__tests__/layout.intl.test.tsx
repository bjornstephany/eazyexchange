import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import fr from '@/messages/fr.json'

// A minimal consumer proving the provider makes `student` keys resolvable.
// The real StudentLayout is an async Server Component and is exercised by
// `pnpm build` + the manual smoke, not unit-rendered here.
function Probe() {
  const t = useTranslations('student')
  return <span>{t('shell.tabs.dossier')}</span>
}

describe('student intl provider', () => {
  it('resolves student keys under the provider (fr)', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <Probe />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Mon dossier')).toBeInTheDocument()
  })
})
