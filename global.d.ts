import type en from '@/messages/en.json'

// Augments next-intl (v4 `AppConfig` form) so useTranslations/getTranslations
// keys are checked against the English catalog. Unknown keys fail `pnpm build`.
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof en
  }
}

export {}
