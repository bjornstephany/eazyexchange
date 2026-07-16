import { cookies, headers } from 'next/headers'
import { getProfile } from '@/lib/supabase/request'
import { DEFAULT_LOCALE, isLocale, matchLocale, type Locale } from '@/lib/i18n/config'
import { LOCALE_COOKIE } from '@/lib/i18n/cookie'

export async function resolveLocale(): Promise<Locale> {
  // 1. Logged-in user — rides the per-request cached profile (no extra query).
  const profile = await getProfile()
  if (profile && isLocale(profile.locale)) return profile.locale

  // 2. Anonymous — NEXT_LOCALE cookie.
  const cookieVal = (await cookies()).get(LOCALE_COOKIE)?.value
  if (cookieVal && isLocale(cookieVal)) return cookieVal

  // 3. No cookie — negotiate Accept-Language.
  const accept = (await headers()).get('accept-language')
  const negotiated = matchLocale(accept?.split(',').map((p) => p.split(';')[0].trim()))
  if (negotiated) return negotiated

  // 4. Fallback.
  return DEFAULT_LOCALE
}
