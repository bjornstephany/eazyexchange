'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeOnboarding } from '@/actions/onboarding'
import { inviteOrganizer } from '@/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function OnboardingForm() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 2 invite state
  const [email, setEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [sent, setSent] = useState<string[]>([])

  async function handleName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await completeOnboarding(new FormData(e.currentTarget))
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setLoading(false)
  }

  async function handleInvite() {
    setInviteBusy(true); setInviteError(null)
    try {
      await inviteOrganizer(email)
      setSent(prev => [...prev, email.trim()])
      setEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setInviteBusy(false)
  }

  if (step === 1) {
    return (
      <form onSubmit={handleName} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-[13px] font-semibold text-[#42506E]">Votre établissement</Label>
          <Input id="name" name="name" required className="h-11 rounded-[10px] border-[#C4CDE0]" />
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h4 className="m-0 font-display text-[17px] font-bold text-[#10203F]">Invitez vos collègues (optionnel)</h4>
        <p className="m-0 text-[14px] leading-relaxed text-[#5B6B8C]">
          Ils pourront co-gérer vos échanges. Vous pourrez aussi les inviter plus tard depuis les Réglages.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleInvite() } }}
          placeholder="adresse@etablissement.fr"
          className="h-11 rounded-[10px] border-[#C4CDE0]"
        />
        <Button type="button" onClick={handleInvite} disabled={inviteBusy} className="h-11 flex-none rounded-[11px] bg-[#2456E6] px-5 text-base font-semibold hover:bg-[#1D48C7]">
          Inviter
        </Button>
      </div>
      {inviteError && <p className="text-sm text-[#C0392B]">{inviteError}</p>}
      {sent.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {sent.map(e => (
            <li key={e} className="rounded-[9px] bg-[#EEF1F7] px-3 py-2 text-[13.5px] text-[#42506E]">
              ✓ Invitation envoyée à <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-between">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')} className="text-[#5B6B8C]">
          Passer
        </Button>
        <Button type="button" onClick={() => router.push('/dashboard')} className="h-11 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          Continuer
        </Button>
      </div>
    </div>
  )
}
