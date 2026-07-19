'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TeamMember, PendingInvite, BillingOverview, ProgramInfo } from '@/actions/settings'
import type { ErasableSubject } from '@/actions/retention'
import type { Locale } from '@/lib/i18n/config'
import { ProfileCard } from './ProfileCard'
import { SecurityCard } from './SecurityCard'
import { TeamCard } from './TeamCard'
import { BillingCard } from './BillingCard'
import { ProgramCard } from './ProgramCard'
import { DataPrivacyCard } from './DataPrivacyCard'
import { LanguageSelect } from './LanguageSelect'
import { ReminderSettingsCard } from '@/components/exchanges/ReminderSettingsCard'

export type SettingsProps = {
  profile: { fullName: string; email: string; schoolName: string }
  isOwner: boolean
  canChangePassword: boolean
  team: { members: TeamMember[]; pending: PendingInvite[] }
  billing: BillingOverview | null
  program: ProgramInfo | null
  locale: Locale
  subjects: ErasableSubject[]
}

type SectionKey = 'compte' | 'equipe' | 'fact' | 'prog' | 'donnees'

export function SettingsView(props: SettingsProps) {
  const t = useTranslations('organizer')
  const [section, setSection] = useState<SectionKey>('compte')
  const sections: { key: SectionKey; label: string }[] = [
    { key: 'compte', label: t('settings.nav.compte') },
    { key: 'equipe', label: t('settings.nav.equipe') },
    ...(props.isOwner ? [{ key: 'fact' as const, label: t('settings.nav.fact') }] : []),
    ...(props.program ? [{ key: 'prog' as const, label: t('settings.nav.prog') }] : []),
    { key: 'donnees', label: t('settings.nav.donnees') },
  ]

  return (
    <div className="max-w-[1120px]">
      <div className="mb-5">
        <h1 className="mb-1 font-display text-[25px] font-bold leading-[1.1] tracking-[-.02em]">{t('settings.heading')}</h1>
        <p className="text-[13px] text-muted-foreground">{t('settings.subtitle')}</p>
      </div>
      <div className="flex items-start gap-[26px]">
        <div className="flex w-[222px] flex-none flex-col gap-1">
          {sections.map(s => (
            <button
              key={s.key} type="button" onClick={() => setSection(s.key)}
              className={`flex items-center rounded-[11px] px-3.5 py-2.5 text-left text-[13.5px] ${
                section === s.key
                  ? 'border bg-card font-semibold text-foreground shadow-float'
                  : 'border border-transparent font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
          {section === 'compte' && (
            <>
              <ProfileCard profile={props.profile} isOwner={props.isOwner} />
              <LanguageSelect current={props.locale} />
              <SecurityCard canChangePassword={props.canChangePassword} />
            </>
          )}
          {section === 'equipe' && <TeamCard team={props.team} isOwner={props.isOwner} />}
          {section === 'fact' && props.billing && <BillingCard billing={props.billing} />}
          {section === 'prog' && props.program && (
            <>
              <ProgramCard program={props.program} isOwner={props.isOwner} />
              <ReminderSettingsCard
                exchangeId={props.program.id}
                initialEnabled={props.program.remindersEnabled}
                initialCadence={props.program.reminderCadence}
                readOnly={props.program.archived}
              />
            </>
          )}
          {section === 'donnees' && <DataPrivacyCard subjects={props.subjects} />}
        </div>
      </div>
    </div>
  )
}
