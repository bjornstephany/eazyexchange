'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { resumeInviteSetup } from '@/actions/invitations'
import { Button } from '@/components/ui/button'

// Abandoned-setup recovery on /invite/[token]: the student already said « Oui »
// but never finished /accept-invite. One click re-mints a session server-side
// (token possession = mailbox proof, expiry still enforced by the action).
export function InviteResumeCard({ token, exchangeName }: { token: string; exchangeName: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function resume() {
    setBusy(true); setError(null)
    try {
      const res = await resumeInviteSetup(token)
      if (!res.ok) { setError(res.message); setBusy(false); return }
      router.push('/accept-invite')
    } catch {
      setError('Une erreur est survenue. Réessaie.'); setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-3.5 inline-flex rounded-full bg-[#DCF3E6] px-3 py-1 text-[13px] font-semibold text-[#0F7A3D]">Participation confirmée</span>
        <h3 className="m-0 mb-2 font-display text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-[#10203F]">Ton inscription à l’échange {exchangeName} est enregistrée</h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#5B6B8C]">Il ne reste plus qu’à configurer ton compte (nom et mot de passe).</p>
      </div>
      <Button disabled={busy} onClick={resume} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">Reprendre la configuration de ton compte</Button>
      {error && <p className="text-sm text-[#C0392B]">{error}</p>}
    </div>
  )
}
