'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateLocale } from '@/actions/settings'
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config'

export function LanguageSelect({ current }: { current: Locale }) {
  const t = useTranslations('organizer')
  const router = useRouter()
  const [value, setValue] = useState<Locale>(current)
  const [busy, setBusy] = useState(false)

  async function onChange(next: Locale) {
    setValue(next); setBusy(true)
    try {
      await updateLocale(next)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <label htmlFor="lang-select" className="mb-1.5 block text-xs font-semibold text-foreground">
        {t('settings.language.label')}
      </label>
      <select
        id="lang-select"
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="h-10 w-full max-w-xs rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:opacity-50 sm:w-auto"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>{LOCALE_NAMES[code]}</option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-placeholder">{t('settings.language.hint')}</p>
    </div>
  )
}
