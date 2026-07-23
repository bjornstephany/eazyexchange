'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { respondToInvitation } from '@/actions/invitations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function InviteResponseForm({ token, studentName, exchangeName, preselect }: {
  token: string
  studentName: string
  exchangeName: string
  preselect: 'yes' | 'no' | 'maybe' | null
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [showQuestions, setShowQuestions] = useState(preselect === 'maybe')
  const [result, setResult] = useState<'yes' | 'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('apply')

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try {
      const res = await respondToInvitation(token, response, response === 'maybe' ? note : '')
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setResult(response)
    } catch {
      // Unexpected failure only — prod redacts thrown messages, so never show them.
      setError(t('invite.error')); setBusy(false)
    }
  }

  if (result === 'yes') return <p className="text-[15px] leading-relaxed text-[#10203F]">{t('invite.resultYes')}</p>
  if (result === 'no') return <p className="text-[15px] leading-relaxed text-[#10203F]">{t('invite.resultNo')}</p>
  if (result === 'maybe') return <p className="text-[15px] leading-relaxed text-[#10203F]">{t('invite.resultMaybe')}</p>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">{t('invite.badge')}</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">
          {t('invite.heading', { name: studentName.trim() || t('invite.yourChild'), exchange: exchangeName })}
        </h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">{t('invite.confirmQuestion')}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button disabled={busy} onClick={() => respond('yes')} className="h-[50px] w-full rounded-[11px] bg-[#1F7A57] text-base font-semibold hover:bg-[#186445]">{t('invite.confirmYes')}</Button>
        <p className="m-0 text-[12.5px] leading-normal text-[#5B6B8C]">{t('invite.terms')}</p>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')} className="h-[50px] w-full rounded-[11px] border-[#C4CDE0] text-base font-semibold">{t('invite.no')}</Button>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-[#E4E9F2] pt-[18px]">
        {showQuestions ? (
          <>
            <Textarea autoFocus placeholder={t('invite.questionsPlaceholder')} value={note} onChange={e => setNote(e.target.value)} className="min-h-20 rounded-[10px] border-[#C4CDE0]" />
            <Button disabled={busy} onClick={() => respond('maybe')} className="h-[46px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">{t('invite.sendQuestions')}</Button>
          </>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => setShowQuestions(true)} className="self-start px-0 font-semibold text-[#5B6B8C] underline underline-offset-[3px] hover:bg-transparent hover:text-[#10203F]">{t('invite.haveQuestions')}</Button>
        )}
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
