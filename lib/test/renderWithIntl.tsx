import { render, type RenderOptions } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import fr from '@/messages/fr.json'
import type { Locale } from '@/lib/i18n/config'

export function renderWithIntl(
  ui: ReactElement,
  opts: { locale?: Locale; messages?: Record<string, unknown> } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { locale = 'fr', messages = fr, ...rest } = opts
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
    rest,
  )
}
