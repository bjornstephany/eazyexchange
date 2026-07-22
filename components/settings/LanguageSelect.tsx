'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateLocale } from '@/actions/settings'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import type { Locale } from '@/lib/i18n/config'

export function LanguageSelect({ current }: { current: Locale }) {
  const t = useTranslations('organizer')
  const router = useRouter()

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <label htmlFor="lang-select" className="mb-1.5 block text-xs font-semibold text-foreground">
        {t('settings.language.label')}
      </label>
      <LanguageSwitcher
        id="lang-select"
        current={current}
        onSelect={async (next) => { await updateLocale(next); router.refresh() }}
      />
      <p className="mt-1 text-[11px] text-placeholder">{t('settings.language.hint')}</p>
    </div>
  )
}
