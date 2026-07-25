'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { InfoCard, ReminderCadence } from '@/actions/exchanges'
import { InfoCardsCard } from './InfoCardsCard'
import { GoodNewsCard } from './GoodNewsCard'
import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'
import type { CommunicationEvent } from '@/lib/communication/history'
import type { GoodNewsValues } from '@/lib/exchange/good-news-fields'
import { HistoryCard } from './HistoryCard'

export type CommunicationProps = {
  exchangeId: string
  archived: boolean
  infoCards: InfoCard[]
  exchangeName: string
  remindersEnabled: boolean
  reminderCadence: ReminderCadence
  goodNewsSubject: string
  goodNewsBody: string
  programDetails: GoodNewsValues | null
  events: CommunicationEvent[]
}

type SubTab = 'infos' | 'modeles' | 'historique' | 'auto'

export function CommunicationView(props: CommunicationProps) {
  const t = useTranslations('organizer')
  const [tab, setTab] = useState<SubTab>('infos')
  const tabs: { key: SubTab; label: string }[] = [
    { key: 'infos', label: t('communication.tabs.infos') },
    { key: 'modeles', label: t('communication.tabs.modeles') },
    { key: 'historique', label: t('communication.tabs.historique') },
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
          {tab === 'modeles' && (
            <GoodNewsCard
              exchangeId={props.exchangeId}
              exchangeName={props.exchangeName}
              initialSubject={props.goodNewsSubject}
              initialBody={props.goodNewsBody}
              details={props.programDetails}
              readOnly={props.archived}
            />
          )}
          {/* Historique is read-only by nature, so `archived` deliberately
              does not reach it. */}
          {tab === 'historique' && <HistoryCard events={props.events} />}
          {tab === 'auto' && (
            <ReminderSettingsCard
              exchangeId={props.exchangeId}
              initialEnabled={props.remindersEnabled}
              initialCadence={props.reminderCadence}
              readOnly={props.archived}
            />
          )}
        </div>
      </div>
    </div>
  )
}
