'use client'
import { useState } from 'react'
import { respondToInvitation } from '@/actions/invitations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EXCHANGE_TERMS_RESPOND_PARENT } from '@/lib/exchange-terms'

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

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try {
      const res = await respondToInvitation(token, response, response === 'maybe' ? note : '')
      if (!res.ok) { setError(res.message); setBusy(false); return }
      setResult(response)
    } catch {
      // Unexpected failure only — prod redacts thrown messages, so never show them.
      setError('Une erreur est survenue. Réessayez.'); setBusy(false)
    }
  }

  if (result === 'yes') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — votre enfant recevra un lien pour créer son accès.</p>
  if (result === 'no') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci de nous avoir prévenus. Nous souhaitons le meilleur à votre enfant.</p>
  if (result === 'maybe') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — nous avons noté vos questions, l’organisateur reviendra vers vous.</p>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">Candidature acceptée 🎉</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">
          {studentName ? `${studentName} ` : 'Votre enfant '}est invité·e à l’échange {exchangeName} !
        </h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Confirmez-vous la participation de votre enfant ?</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button disabled={busy} onClick={() => respond('yes')} className="h-[50px] w-full rounded-[11px] bg-[#1F7A57] text-base font-semibold hover:bg-[#186445]">Oui, nous confirmons</Button>
        <p className="m-0 text-[12.5px] leading-normal text-[#5B6B8C]">{EXCHANGE_TERMS_RESPOND_PARENT}</p>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')} className="h-[50px] w-full rounded-[11px] border-[#C4CDE0] text-base font-semibold">Non</Button>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-[#E4E9F2] pt-[18px]">
        {showQuestions ? (
          <>
            <Textarea autoFocus placeholder="Vos questions pour l’organisateur…" value={note} onChange={e => setNote(e.target.value)} className="min-h-20 rounded-[10px] border-[#C4CDE0]" />
            <Button disabled={busy} onClick={() => respond('maybe')} className="h-[46px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Envoyer mes questions</Button>
          </>
        ) : (
          <Button variant="ghost" disabled={busy} onClick={() => setShowQuestions(true)} className="self-start px-0 font-semibold text-[#5B6B8C] underline underline-offset-[3px] hover:bg-transparent hover:text-[#10203F]">Oui, mais nous avons des questions…</Button>
        )}
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
