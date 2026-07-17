'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToInvitation } from '@/actions/invitations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EXCHANGE_TERMS_RESPOND } from '@/lib/exchange-terms'

export function InviteResponseForm({ token, firstName, exchangeName }: { token: string; firstName: string; exchangeName: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<'no' | 'maybe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function respond(response: 'yes' | 'no' | 'maybe') {
    setBusy(true); setError(null)
    try {
      const res = await respondToInvitation(token, response, response === 'maybe' ? note : '')
      if (!res.ok) { setError(res.message); setBusy(false); return }
      // Yes → the action just minted the session; land on account setup.
      // Stay busy through the navigation so the buttons can't double-fire.
      if (response === 'yes') { router.push('/accept-invite'); return }
      setResult(response)
    } catch {
      // Unexpected failure only — prod redacts thrown messages, so never show them.
      setError('Une erreur est survenue. Réessaie.'); setBusy(false)
    }
  }

  if (result === 'no') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci de nous avoir prévenus. Nous te souhaitons le meilleur.</p>
  if (result === 'maybe') return <p className="text-[15px] leading-relaxed text-[#10203F]">Merci — nous avons noté ta réponse, l’organisateur reviendra vers toi.</p>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">Candidature acceptée 🎉</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">{firstName ? `${firstName}, ` : ''}tu es invitée à l’échange {exchangeName} !</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Ta candidature a été retenue. Veux-tu participer ?</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button disabled={busy} onClick={() => respond('yes')} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Oui, je veux participer</Button>
        <p className="m-0 text-[12.5px] leading-normal text-[#5B6B8C]">{EXCHANGE_TERMS_RESPOND}</p>
        <Button variant="outline" disabled={busy} onClick={() => respond('no')} className="h-[50px] w-full rounded-[11px] border-[#C4CDE0] text-base font-semibold">Non merci</Button>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-[#E4E9F2] pt-[18px]">
        <Textarea placeholder="Si tu hésites, laisse une note (facultatif)" value={note} onChange={e => setNote(e.target.value)} className="min-h-16 rounded-[10px] border-[#C4CDE0]" />
        <Button variant="ghost" disabled={busy} onClick={() => respond('maybe')} className="self-start px-0 font-semibold text-[#5B6B8C] underline underline-offset-[3px] hover:bg-transparent hover:text-[#10203F]">Peut-être — j’ai besoin de temps</Button>
      </div>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
