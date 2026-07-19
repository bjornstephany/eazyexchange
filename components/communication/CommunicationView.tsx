'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { InfoCard } from '@/actions/exchanges'
import { InfoCardsCard } from './InfoCardsCard'

export type CommunicationProps = {
  exchangeId: string
  archived: boolean
  infoCards: InfoCard[]
}

type SubTab = 'infos' | 'modeles' | 'annonces' | 'auto'

export function CommunicationView(props: CommunicationProps) {
  const t = useTranslations('organizer')
  const [tab, setTab] = useState<SubTab>('infos')
  const tabs: { key: SubTab; label: string }[] = [
    { key: 'infos', label: t('communication.tabs.infos') },
    { key: 'modeles', label: t('communication.tabs.modeles') },
    { key: 'annonces', label: t('communication.tabs.annonces') },
    { key: 'auto', label: t('communication.tabs.auto') },
  ]

  return (
    <div className="max-w-[1120px]">
      <div className="mb-5">
        <h1 className="mb-1 font-display text-[25px] font-bold leading-[1.1] tracking-[-.02em]">{t('communication.heading')}</h1>
        <p className="text-[13px] text-muted-foreground">{t('communication.subtitle')}</p>
      </div>
      <div className="flex items-start gap-[26px]">
        <div className="flex w-[222px] flex-none flex-col gap-1">
          {tabs.map(s => (
            <button
              key={s.key} type="button" onClick={() => setTab(s.key)}
              className={`flex items-center rounded-[11px] px-3.5 py-2.5 text-left text-[13.5px] ${
                tab === s.key
                  ? 'border bg-card font-semibold text-foreground shadow-float'
                  : 'border border-transparent font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
          {tab === 'infos' && (
            <InfoCardsCard
              exchangeId={props.exchangeId}
              initialCards={props.infoCards}
              readOnly={props.archived}
            />
          )}
          {tab !== 'infos' && (
            <div className="rounded-2xl border bg-card px-7 py-[26px] text-[13px] text-muted-foreground">
              {t('communication.comingSoon')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
