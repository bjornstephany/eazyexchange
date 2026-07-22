import { createTranslator, type AbstractIntlMessages } from 'next-intl'
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

// A namespace-scoped translator. Both next-intl's `useTranslations` /
// `getTranslations` and our own `namespaceTranslator` are assignable to this,
// so helpers that need labels can take one without caring which produced it.
export type AppTranslator = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string

// Shallow subset of a catalog. The anonymous apply funnel mounts a provider on
// public pages; shipping the whole catalog there would push organizer copy into
// an unauthenticated bundle for no benefit.
export function pickNamespaces(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const out: Record<string, unknown> = {}
  for (const ns of namespaces) {
    if (ns in (messages as Record<string, unknown>)) {
      out[ns] = (messages as Record<string, unknown>)[ns]
    }
  }
  return out as AbstractIntlMessages
}

// A sync translator for code that runs outside React's request context — the
// PDF recap renderer and other pure helpers that take a locale as data.
export async function namespaceTranslator(
  locale: Locale,
  namespace: string,
): Promise<AppTranslator> {
  const messages = await loadMessages(locale)
  const t = createTranslator({ locale, messages, namespace })
  return (key, values) => t(key as never, values as never)
}
