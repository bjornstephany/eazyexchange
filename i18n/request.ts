import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { loadMessages } from '@/lib/i18n/messages'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config'
import { LOCALE_COOKIE } from '@/lib/i18n/cookie'

export default getRequestConfig(async () => {
  // Interim resolver (cookie → default). Task 2 replaces this call with
  // resolveLocale() (profile-aware, 4-tier).
  const cookieVal = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale: Locale = cookieVal && isLocale(cookieVal) ? cookieVal : DEFAULT_LOCALE
  return { locale, messages: await loadMessages(locale) }
})
