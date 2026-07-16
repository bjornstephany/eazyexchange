import { isLocale, type Locale } from '@/lib/i18n/config'

export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function readLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
  if (!match) return null
  const value = decodeURIComponent(match.slice(LOCALE_COOKIE.length + 1))
  return isLocale(value) ? value : null
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`
}
