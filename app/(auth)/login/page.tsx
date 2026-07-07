'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CenteredCard } from '@/components/auth/CenteredCard'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'invite_invalid') {
      setError('Ce lien d’invitation est invalide ou a expiré — demandez à votre organisateur de vous le renvoyer.')
    } else if (err === 'signup_failed') {
      setError('Nous n’avons pas pu terminer la création de votre compte. Réessayez de vous inscrire.')
    } else if (err === 'oauth_failed') {
      setError('La connexion avec Google a échoué. Veuillez réessayer.')
    } else if (err === 'not_invited') {
      setError('Nous n’avons pas pu associer votre compte Google à une invitation. Utilisez l’adresse e-mail avec laquelle vous avez été invité, ou définissez un mot de passe depuis votre lien d’invitation.')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  return (
    <CenteredCard maxWidth={460} className="flex flex-col gap-[22px]">
      <h3 className="m-0 font-display text-2xl font-bold tracking-[-0.02em] text-[#10203F]">Connexion</h3>

      <form onSubmit={handleLogin} className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="sr-only">Adresse e-mail</Label>
          <div className="relative">
            <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8A97B2]" />
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="Adresse e-mail"
              className="h-[50px] rounded-[11px] border-[#C4CDE0] pl-11 text-base" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="sr-only">Mot de passe</Label>
          <div className="relative">
            <Lock aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8A97B2]" />
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Mot de passe"
              className="h-[50px] rounded-[11px] border-[#C4CDE0] pl-11 text-base" />
          </div>
        </div>
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button type="submit" disabled={loading}
          className="h-[50px] w-full rounded-[11px] bg-[#2456E6] text-[17px] font-semibold hover:bg-[#1D48C7]">
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <div className="flex items-center gap-3.5 font-mono text-[13px] font-medium text-[#8A97B2]">
        <span className="flex-1 border-t border-[#E4E9F2]" />ou continuer avec<span className="flex-1 border-t border-[#E4E9F2]" />
      </div>
      <GoogleButton label="Google" />

      <p className="text-center text-sm text-[#5B6B8C]">
        Pas encore de compte&nbsp;?{' '}
        <Link href="/signup" className="font-semibold text-[#2456E6] hover:underline">Créer un compte</Link>
      </p>
    </CenteredCard>
  )
}
