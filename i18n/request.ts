import { getRequestConfig } from 'next-intl/server'
import { loadMessages } from '@/lib/i18n/messages'
import { resolveLocale } from '@/lib/i18n/resolve'

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return { locale, messages: await loadMessages(locale) }
})
