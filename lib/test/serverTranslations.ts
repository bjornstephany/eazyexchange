import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'

// Stand-in for `next-intl/server` in unit tests. The real getTranslations goes
// through i18n/request.ts → resolveLocale(), which needs a Next request context
// (cookies/headers) that jsdom does not have. This resolves against the real
// French catalog instead, so async Server Components keep their verbatim French
// assertions.
//
// Usage (the async form is required — vi.mock hoists above imports):
//   vi.mock('next-intl/server', async () =>
//     (await import('@/lib/test/serverTranslations')).serverTranslationsMock)
export const serverTranslationsMock = {
  getTranslations: async (namespace?: string) =>
    createTranslator({ locale: 'fr', messages: fr, namespace } as never),
  // Components under test render French by default, matching renderWithIntl.
  getLocale: async () => 'fr',
}
