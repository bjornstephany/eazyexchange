export const LOCALES = ['en', 'fr', 'es', 'it', 'de'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  de: 'Deutsch',
}

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x)
}

/**
 * Negotiate a browser language preference against the supported locales.
 * Accepts a single BCP-47 tag (e.g. `navigator.language`) or an ordered
 * preference list (e.g. `navigator.languages`); returns the first supported
 * match on its primary subtag, or `null` when none are supported.
 */
export function matchLocale(
  preferred: string | readonly string[] | undefined | null
): Locale | null {
  if (!preferred) return null
  const list = Array.isArray(preferred) ? preferred : [preferred as string]
  for (const tag of list) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isLocale(primary)) return primary
  }
  return null
}
