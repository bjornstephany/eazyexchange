'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getStudentContext } from '@/actions/student-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function AcceptInvitePage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [exchangeLabel, setExchangeLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Session was established server-side by /auth/confirm, so this self-scoped
  // read succeeds; the pill is decorative and degrades to nothing on failure.
  useEffect(() => {
    getStudentContext().then(ctx => setExchangeLabel(ctx.exchangeLabel)).catch(() => {})
  }, [])

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data: { user }, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError || !user) {
      setError(updateError?.message ?? 'Ton lien d\’invitation est invalide ou a expiré — demande à ton organisateur de te le renvoyer.')
      setLoading(false)
      return
    }
    const { error: profileError } = await supabase.from('users').update({ full_name: fullName }).eq('id', user.id)
    if (profileError) { setError(profileError.message); setLoading(false); return }
    router.push('/my-forms')
    router.refresh()
  }

  return (
    <CenteredCard maxWidth={460} className="flex flex-col gap-[18px]">
      <div>
        {exchangeLabel && (
          <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{exchangeLabel}</span>
        )}
        <h3 className="m-0 mb-1.5 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">Configure ton compte</h3>
        <p className="m-0 text-[15px] leading-[1.55] text-[#5B6B8C]">Dernière étape avant ton espace élève.</p>
      </div>
      <GoogleButton next="/my-forms" label="Continuer avec Google" />
      <div className="flex items-center gap-3.5 font-mono text-xs font-medium text-[#8A97B2]">
        <span className="flex-1 border-t border-[#E4E9F2]" />ou choisis un mot de passe<span className="flex-1 border-t border-[#E4E9F2]" />
      </div>
      <form onSubmit={handleAccept} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
          <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-[13px] font-semibold text-[#42506E]">Mot de passe</Label>
          <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="8 caractères minimum" className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading} className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Configuration…' : 'C\’est parti'}
        </Button>
      </form>
    </CenteredCard>
  )
}
