import type { NextRequest } from 'next/server'
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

/**
 * Same cookie → Accept-Language cascade as resolveLocale(), minus the
 * profile step — for the one moment that step can never apply: seeding a
 * brand-new organizer's locale in provisionOrganizer, which runs before their
 * `users` row exists. Reads straight off the NextRequest instead of the async
 * next/headers cookies()/headers() APIs, both because there is no profile to
 * race against and because /auth/confirm and /auth/callback's Route Handler
 * tests call GET() directly, outside the request-scope machinery those APIs
 * need.
 */
export function resolveRequestLocale(request: NextRequest): Locale {
  const cookieVal = request.cookies.get(LOCALE_COOKIE)?.value
  if (cookieVal && isLocale(cookieVal)) return cookieVal

  const accept = request.headers.get('accept-language')
  const negotiated = matchLocale(accept?.split(',').map((p) => p.split(';')[0].trim()))
  if (negotiated) return negotiated

  return DEFAULT_LOCALE
}
