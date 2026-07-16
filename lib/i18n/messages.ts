import type { AbstractIntlMessages } from 'next-intl'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config'

// Dynamic-import a catalog. Falls back to the default locale (en) if a locale
// file does not exist yet (es/it/de land in Task 13).
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  try {
    return (await import(`@/messages/${locale}.json`)).default
  } catch {
    return (await import(`@/messages/${DEFAULT_LOCALE}.json`)).default
  }
}
