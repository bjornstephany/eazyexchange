'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { inviteOrganizer, revokeOrganizerInvite, removeOrganizer, type TeamMember, type PendingInvite } from '@/actions/settings'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const MEMBER_AVATARS = ['linear-gradient(135deg,#3B6EF6,#0E1B38)', '#7C5CE0', '#0F8A6D', '#C2543A', '#B0468C']

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

export function TeamCard({ team, isOwner }: {
  team: { members: TeamMember[]; pending: PendingInvite[] }
  isOwner: boolean
}) {
  const t = useTranslations('organizer')
  const c = useTranslations('common')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  async function handleInvite() {
    setBusy(true); setError(null); setFlash(null)
    try {
      const res = await inviteOrganizer(invite)
      // Expected refusals (rate limit, duplicate, bad address) are values now —
      // a thrown message here was an opaque digest in production.
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setInvite('')
      setFlash(t('settings.team.inviteSuccess'))
    } catch {
      setError(c('errors.generic'))
    }
    setBusy(false)
  }

  async function handleRevoke(id: string) {
    setError(null)
    try { await revokeOrganizerInvite(id) }
    catch (err) { setError(err instanceof Error ? err.message : c('errors.generic')) }
  }

  async function handleRemove() {
    if (!removing) return
    setRemoveBusy(true); setError(null)
    try {
      await removeOrganizer(removing.id)
      setRemoving(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : c('errors.generic'))
    }
    setRemoveBusy(false)
  }

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-1 font-display text-[15px] font-bold tracking-[-.01em] text-foreground">{t('settings.team.heading')}</div>
      <p className="mb-[18px] text-[12.5px] text-tertiary">
        {t('settings.team.description')}
      </p>

      {isOwner && (
        <div className="flex gap-2.5">
          <input
            value={invite} onChange={e => setInvite(e.target.value)}
            placeholder={t('settings.team.invitePlaceholder')}
            className="h-10 min-w-0 flex-1 rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none"
          />
          <button
            type="button" onClick={handleInvite} disabled={busy}
            className="h-10 flex-none rounded-[9px] bg-brand px-4 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {t('settings.team.inviteButton')}
          </button>
        </div>
      )}
      {(error || flash) && (
        <p className={`mt-2 text-[12.5px] font-medium ${error ? 'text-danger-text' : 'text-success-text'}`}>
          {error ?? flash}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-subtle">
        {team.members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 border-b border-subtle px-4 py-3 last:border-b-0">
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: MEMBER_AVATARS[i % MEMBER_AVATARS.length] }}
            >
              {initialsOf(m.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-foreground">{m.name}</span>
                {m.isYou && (
                  <span className="rounded-pill bg-tint px-2 py-px font-mono text-[10px] font-semibold text-tint-text">{t('settings.team.youBadge')}</span>
                )}
              </span>
              <span className="mt-px block truncate text-xs text-tertiary">{m.email}</span>
            </span>
            {m.isOwner ? (
              <span className="rounded-pill bg-navy px-3 py-[5px] text-[11.5px] font-semibold text-white">{t('settings.team.ownerBadge')}</span>
            ) : (
              <span className="rounded-pill bg-subtle px-3 py-[5px] text-[11.5px] font-semibold text-muted-foreground">{t('settings.team.adminBadge')}</span>
            )}
            {isOwner && !m.isOwner && !m.isYou && (
              <button
                type="button"
                onClick={() => setRemoving(m)}
                className="px-1.5 py-1 text-xs font-semibold text-tertiary hover:text-danger-text"
              >
                {t('settings.team.removeButton')}
              </button>
            )}
          </div>
        ))}
        {team.pending.map(p => (
          <div key={p.id} className="flex items-center gap-3 border-b border-subtle bg-hoverrow px-4 py-3 last:border-b-0">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-placeholder text-[13px] font-semibold text-placeholder">@</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-muted-foreground">{p.email}</span>
              <span className="mt-px block text-xs text-tertiary">{t('settings.team.adminBadge')}</span>
            </span>
            <span className="rounded-pill bg-warn px-2.5 py-[3px] text-[11px] font-semibold text-warn-text">{t('settings.team.pendingBadge')}</span>
            {isOwner && (
              <button
                type="button" onClick={() => handleRevoke(p.id)}
                className="px-1.5 py-1 text-xs font-semibold text-tertiary hover:text-danger-text"
              >
                {t('settings.team.revokeButton')}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[11px] border border-subtle px-[15px] py-[13px]">
          <div className="mb-[3px] text-[12.5px] font-semibold text-foreground">{t('settings.team.ownerBadge')}</div>
          <div className="text-[11.5px] leading-[1.45] text-tertiary">{t('settings.team.ownerRoleDesc')}</div>
        </div>
        <div className="rounded-[11px] border border-subtle px-[15px] py-[13px]">
          <div className="mb-[3px] text-[12.5px] font-semibold text-foreground">{t('settings.team.adminBadge')}</div>
          <div className="text-[11.5px] leading-[1.45] text-tertiary">{t('settings.team.adminRoleDesc')}</div>
        </div>
      </div>

      <Dialog open={!!removing} onOpenChange={o => { if (!o) setRemoving(null) }}>
        <DialogContent className="max-w-[440px] rounded-card p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold text-navy">{t('settings.team.removeDialog.title')}</DialogTitle>
            <DialogDescription className="text-[14px] text-muted-foreground">
              {t('settings.team.removeDialog.description', { name: removing?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setRemoving(null)} className="text-muted-foreground">
              {c('actions.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={handleRemove} disabled={removeBusy}>
              {removeBusy ? t('settings.team.removeDialog.confirming') : t('settings.team.removeDialog.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
