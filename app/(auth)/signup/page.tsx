'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { GoogleButton } from '@/components/auth/GoogleButton'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = fullName.trim()
    const school = schoolName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name || !school) { setError('Veuillez remplir tous les champs.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: name, school_name: school },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
        <Logo href="/" />
        <AuthCard maxWidth={460} className="flex flex-col gap-3">
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Vérifiez votre e-mail</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">Nous avons envoyé un lien de confirmation à votre adresse e-mail. Cliquez dessus pour finaliser la création de votre compte.</p>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EEF1F7] px-4 py-10">
      <div className="flex w-full max-w-[860px] flex-col items-center gap-[60px] md:flex-row md:items-center">
        <div className="flex w-full flex-col gap-5 md:w-[340px]">
          <Logo href="/" />
          <h3 className="m-0 font-display text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-[#10203F]">Organisez vos échanges scolaires sans tableur.</h3>
          <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">Candidatures, formulaires et dossiers élèves — au même endroit, pour les deux établissements.</p>
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">ESSAI GRATUIT · 1 ÉCHANGE</span>
        </div>
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <h3 className="m-0 mb-1 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Créer votre compte</h3>
          <GoogleButton intent="organizer_signup" next="/dashboard" label="S’inscrire avec Google" />
          <div className="flex items-center gap-3.5 font-mono text-xs font-medium text-[#8A97B2]">
            <span className="flex-1 border-t border-[#E4E9F2]" />ou<span className="flex-1 border-t border-[#E4E9F2]" />
          </div>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fullName" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
                <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="schoolName" className="text-[13px] font-semibold text-[#42506E]">Établissement</Label>
                <Input id="schoolName" value={schoolName} onChange={e => setSchoolName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-[13px] font-semibold text-[#42506E]">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-[13px] font-semibold text-[#42506E]">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="8 caractères minimum" className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            {error && <p className="text-sm text-[#C0392B]">{error}</p>}
            <Button type="submit" disabled={loading} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
              {loading ? 'Création…' : 'Créer mon compte'}
            </Button>
          </form>
        </AuthCard>
      </div>
    </div>
  )
}
