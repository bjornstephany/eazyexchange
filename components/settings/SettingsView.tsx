'use client'
import { useState } from 'react'
import type { TeamMember, PendingInvite, BillingOverview, ProgramInfo } from '@/actions/settings'
import { ProfileCard } from './ProfileCard'
import { SecurityCard } from './SecurityCard'

export type SettingsProps = {
  profile: { fullName: string; email: string; phone: string; title: string; schoolName: string }
  isOwner: boolean
  canChangePassword: boolean
  team: { members: TeamMember[]; pending: PendingInvite[] }
  billing: BillingOverview | null
  program: ProgramInfo | null
}

type SectionKey = 'compte' // Task 12 widens this to 'compte' | 'equipe' | 'fact' | 'prog'

export function SettingsView(props: SettingsProps) {
  const [section, setSection] = useState<SectionKey>('compte')
  const sections: { key: SectionKey; label: string }[] = [
    { key: 'compte', label: 'Compte personnel' },
  ]

  return (
    <div className="max-w-[1120px]">
      <div className="mb-5">
        <h1 className="mb-1 font-display text-[25px] font-bold leading-[1.1] tracking-[-.02em]">Réglages</h1>
        <p className="text-[13px] text-muted-foreground">Votre compte, votre équipe et votre abonnement.</p>
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
              <ProfileCard profile={props.profile} />
              <SecurityCard canChangePassword={props.canChangePassword} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
