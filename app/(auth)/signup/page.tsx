'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { SchoolCombobox } from '@/app/onboarding/SchoolCombobox'
import { searchPublicSchools } from '@/actions/public-schools'
import type { SchoolOption } from '@/lib/schools/registry'
import { resendSignupEmail } from './actions'

const RESEND_COOLDOWN = 45

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState<SchoolOption | null>(null)
  const [roleDescription, setRoleDescription] = useState('')
  const [howFoundUs, setHowFoundUs] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [resendError, setResendError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resendNote, setResendNote] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!submitted) return
    const t = setInterval(() => setCooldown(c => (c <= 0 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [submitted])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const name = fullName.trim()
    const cleanEmail = normalizeEmail(email)
    if (!name) { setError('Veuillez remplir tous les champs.'); return }
    if (!school) { setError('Veuillez sélectionner votre établissement.'); return }
    if (!roleDescription.trim()) { setError('Veuillez indiquer votre rôle.'); return }
    if (!howFoundUs.trim()) { setError('Dites-nous comment vous nous avez connus.'); return }
    if (!isValidEmail(cleanEmail)) { setError('Veuillez saisir une adresse e-mail valide.'); return }
    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: name,
          school_uai: school.uai,
          school_name: school.name,
          school_country: 'FR',
          role_description: roleDescription.trim(),
          how_found_us: howFoundUs.trim(),
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    setConfirmEmail(cleanEmail)
    setCooldown(RESEND_COOLDOWN)
    setSubmitted(true)
    setLoading(false)
  }

  async function handleResend() {
    setResendError(null)
    setResendNote(null)
    const res = await resendSignupEmail(confirmEmail)
    if (res.ok) {
      setResendNote('Un nouvel e-mail vient d’être envoyé.')
      setCooldown(RESEND_COOLDOWN)
    } else {
      setResendError('Impossible de renvoyer l’e-mail pour le moment. Réessayez dans un instant.')
    }
  }

  function handleRestart() {
    setSubmitted(false)
    setResendError(null)
    setResendNote(null)
    setCooldown(0)
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
        <Logo href="/" />
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E7EDFD] text-[#2456E6]">
            <MailCheck className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Vérifiez votre e-mail</h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Nous venons d’envoyer un e-mail à{' '}
            <span className="font-semibold text-[#10203F]">{confirmEmail}</span>. Ouvrez-le et
            cliquez sur <span className="font-semibold text-[#10203F]">« Confirmer mon inscription »</span>{' '}
            pour finaliser la création de votre compte.
          </p>
          <p className="m-0 rounded-[10px] bg-[#F4F6FB] px-3.5 py-3 text-[13px] leading-relaxed text-[#5B6B8C]">
            Rien reçu au bout de deux minutes ? Vérifiez vos courriers indésirables, puis
            renvoyez l’e-mail ci-dessous.
          </p>
          {resendError && <p className="m-0 text-sm text-[#C0392B]">{resendError}</p>}
          {resendNote && <p className="m-0 text-[13px] font-medium text-[#22A06B]">{resendNote}</p>}
          <div className="flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="font-medium text-[#2456E6] hover:underline disabled:cursor-not-allowed disabled:text-[#8A97B2] disabled:no-underline"
            >
              {cooldown > 0 ? `Renvoyer l’e-mail (${cooldown}s)` : 'Renvoyer l’e-mail'}
            </button>
            <button type="button" onClick={handleRestart} className="font-medium text-[#8A97B2] hover:text-[#42506E] hover:underline">
              Recommencer
            </button>
          </div>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EEF1F7] px-4 py-10">
      <div className="flex w-full max-w-[860px] flex-col items-center gap-[60px] md:flex-row md:items-center">
        <div className="flex w-full flex-col gap-5 md:w-[340px]">
          <Logo href="/" />
          <h3 className="m-0 font-display text-[30px] font-bold leading-[1.2] tracking-[-0.02em] text-[#10203F]">Organisez vos échanges scolaires facilement.</h3>
          <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">Candidatures, formulaires et dossiers élèves — au même endroit, pour les deux établissements.</p>
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">ESSAI GRATUIT · 1 ÉCHANGE</span>
        </div>
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <h3 className="m-0 mb-1 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">Créer votre compte</h3>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName" className="text-[13px] font-semibold text-[#42506E]">Nom complet</Label>
              <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <SchoolCombobox value={school} onSelect={setSchool} search={searchPublicSchools} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="roleDescription" className="text-[13px] font-semibold text-[#42506E]">Votre rôle</Label>
              <Input id="roleDescription" value={roleDescription} onChange={e => setRoleDescription(e.target.value)} required placeholder="Professeure d’allemand" className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="howFoundUs" className="text-[13px] font-semibold text-[#42506E]">Comment nous avez-vous connus ?</Label>
              <Input id="howFoundUs" value={howFoundUs} onChange={e => setHowFoundUs(e.target.value)} required placeholder="Recommandation d’un collègue" className="h-11 rounded-[10px] border-[#C4CDE0]" />
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

          {/* Email/password is the primary path; Google reads as the alternative.
              Same order and same wording as /login — the two entry points must not
              disagree about which method is the default. `intent` is load-bearing:
              app/auth/callback/route.ts signs out and deletes the orphan auth row
              of any Google user with neither an invited profile nor this flag. */}
          <div className="flex items-center gap-3.5 font-mono text-xs font-medium text-[#8A97B2]">
            <span className="flex-1 border-t border-[#E4E9F2]" />ou continuer avec<span className="flex-1 border-t border-[#E4E9F2]" />
          </div>
          <GoogleButton intent="organizer_signup" next="/onboarding" label="Google" />

          <p className="m-0 text-center text-xs leading-[1.5] text-[#8A97B2]">
            En créant un compte, vous acceptez nos{' '}
            <Link href="/legal/cgu" className="font-medium text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
              CGU
            </Link>{' '}
            et notre{' '}
            <Link href="/legal/confidentialite" className="font-medium text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F]">
              Politique de confidentialité
            </Link>
            .
          </p>
        </AuthCard>
      </div>
    </div>
  )
}
