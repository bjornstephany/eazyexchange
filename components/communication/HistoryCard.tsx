'use client'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { FileTextIcon, MailIcon, PencilIcon, Trash2Icon, type LucideIcon } from 'lucide-react'
import { groupHistory, type CommunicationEvent, type InfoEventKind } from '@/lib/communication/history'

const INFO_ICON: Record<InfoEventKind, LucideIcon> = {
  info_published: FileTextIcon,
  info_updated: PencilIcon,
  info_deleted: Trash2Icon,
}
const INFO_KEY: Record<InfoEventKind, 'infoPublished' | 'infoUpdated' | 'infoDeleted'> = {
  info_published: 'infoPublished',
  info_updated: 'infoUpdated',
  info_deleted: 'infoDeleted',
}

export function HistoryCard({ events }: { events: CommunicationEvent[] }) {
  const t = useTranslations('organizer')
  const locale = useLocale()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const days = groupHistory(events)
  const dayLabel = (iso: string) => new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(iso))
  const timeLabel = (iso: string) => new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('communication.history.heading')}</div>
      <p className="m-0 mb-4 text-[12.5px] leading-normal text-muted-foreground">{t('communication.history.description')}</p>

      {days.length === 0 && (
        <p className="text-[12.5px] text-muted-foreground">{t('communication.history.empty')}</p>
      )}

      <div className="flex flex-col gap-5">
        {days.map(day => (
          <div key={day.key}>
            <div data-history-day={day.key} className="mb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-tertiary">
              {dayLabel(day.at)}
            </div>
            <div className="flex flex-col gap-1.5">
              {day.entries.map(entry => {
                if (entry.type === 'info') {
                  const Icon = INFO_ICON[entry.kind]
                  return (
                    <div key={entry.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
                      <Icon aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 flex-none text-tertiary" />
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">
                        {t(`communication.history.${INFO_KEY[entry.kind]}`, { subject: entry.subject })}
                      </span>
                      <span className="flex-none text-[11.5px] tabular-nums text-tertiary">{timeLabel(entry.at)}</span>
                    </div>
                  )
                }

                const open = expanded.has(entry.id)
                return (
                  <div key={entry.id} className="rounded-lg px-2 py-1.5">
                    <div className="flex items-start gap-2.5">
                      <MailIcon aria-hidden size={14} strokeWidth={1.75} className="mt-0.5 flex-none text-tertiary" />
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">
                        {t('communication.history.goodNews', { count: entry.sent + entry.failed })}
                        {/* No banner: at this volume the inline counts are loud enough. */}
                        {entry.failed > 0 && (
                          <span className="ml-2 text-[12px] font-semibold text-danger-text">
                            {t('communication.history.counts', { sent: entry.sent, failed: entry.failed })}
                          </span>
                        )}
                      </span>
                      <span className="flex-none text-[11.5px] tabular-nums text-tertiary">{timeLabel(entry.at)}</span>
                    </div>
                    <button
                      type="button" onClick={() => toggle(entry.id)}
                      className="ml-[26px] mt-0.5 text-[12px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {open ? t('communication.history.collapse') : t('communication.history.expand')}
                    </button>
                    {open && (
                      <ul className="ml-[26px] mt-1.5 flex list-none flex-col gap-1 p-0">
                        {entry.recipients.map(r => (
                          <li key={r.id} className={`text-[12.5px] ${r.status === 'failed' ? 'text-danger-text' : 'text-muted-foreground'}`}>
                            {r.subject}
                            {r.status === 'failed' && <span className="ml-1.5 font-medium">— {t('communication.history.failedNotice')}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
