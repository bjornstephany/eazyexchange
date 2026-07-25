'use client'
import { useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { DossierRollup, Pill } from '@/lib/dashboard/rollup'
import { shortDate } from '@/lib/dates'
import type { Locale } from '@/lib/i18n/config'
import { StatusPill } from '@/components/dashboard/StatusPill'

export type DrawerSubject = {
  rollup: DossierRollup
  items: { label: string; group: 'form' | 'doc'; pill: Pill }[]
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

export function StudentDrawer({ subject, onClose }: { subject: DrawerSubject | null; onClose: () => void }) {
  const t = useTranslations('organizer')
  const locale = useLocale() as Locale

  useEffect(() => {
    if (!subject) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [subject, onClose])

  if (!subject) return null
  const name = subject.rollup.name

  return (
    <div className="fixed inset-0 z-40">
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-rail/30"
      />
      <div className="absolute right-0 top-0 h-full w-[420px] bg-card shadow-modal p-7 overflow-auto animate-[drwIn_.25s_ease-out]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-tint text-tint-text font-mono text-[13px] font-semibold">
            {initials(name)}
          </span>
          <span className="font-display text-lg font-bold text-navy">{name}</span>
          <StatusPill pill={subject.rollup.overall} />
          <button type="button" onClick={onClose} className="ml-auto text-placeholder hover:text-navy">
            ✕
          </button>
        </div>

        <div className="font-mono text-[11px] font-semibold uppercase tracking-[.1em] text-tertiary mt-6 mb-3">
          {t('dashboard.formsAndDocsHeading')}
          {subject.rollup.due ? t('dashboard.dueSuffix', { date: shortDate(subject.rollup.due, locale) }) : ''}
        </div>
        <div>
          {subject.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
              <span className="text-sm text-navy">{item.label}</span>
              <StatusPill pill={item.pill} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-start mt-4 text-[12.5px] text-muted-foreground">
          <span className="text-brand">&#8635;</span>
          <span>{t('dashboard.autoReminderHint')}</span>
        </div>
      </div>
    </div>
  )
}
