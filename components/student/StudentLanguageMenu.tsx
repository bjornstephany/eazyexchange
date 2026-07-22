'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateLocale } from '@/actions/settings'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import type { Locale } from '@/lib/i18n/config'

// The student portal has no settings page, so the language control lives in the
// account menu (spec §UX). Writes users.locale — the same column and action the
// organizer settings card uses.
export function StudentLanguageMenu({ current }: { current: Locale }) {
  const t = useTranslations('student')
  const router = useRouter()

  return (
    <div className="border-b px-3 py-2">
      <label htmlFor="student-lang" className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {t('shell.language')}
      </label>
      <LanguageSwitcher
        id="student-lang"
        current={current}
        onSelect={async (next) => { await updateLocale(next); router.refresh() }}
        className="h-8 w-full rounded-[7px] border px-2 text-[12.5px] focus:border-brand focus:outline-none disabled:opacity-50"
      />
    </div>
  )
}
