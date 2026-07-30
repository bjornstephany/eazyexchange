'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MailCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/brand/Logo'
import { AuthCard } from '@/components/auth/AuthCard'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { requestOrganizerSignup, resendSignupEmail } from './actions'

const RESEND_COOLDOWN = 45
const SUPPORT_EMAIL = 'contact@eazyexchange.com'

// The page has three terminal states: the form, « Vérifiez votre e-mail » for an
// allowlisted address, and the waitlist message for everyone else. Validation
// and account creation both live in requestOrganizerSignup — the browser no
// longer talks to Supabase here at all, because a client-side check cannot
// prevent an account from existing.
type Step = 'form' | 'confirm' | 'waitlisted'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [resendError, setResendError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resendNote, setResendNote] = useState<string | null>(null)

  // How the Google path returns here: app/auth/callback/route.ts tears down the
  // orphan auth row and redirects to /signup?waitlisted=1. Read in an effect,
  // like /login reads ?error= — useSearchParams() would force a <Suspense>
  // boundary, and reading window.location during render would hydration-mismatch.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('waitlisted') === '1') {
      setStep('waitlisted')
    }
  }, [])

  useEffect(() => {
    if (step !== 'confirm') return
    const t = setInterval(() => setCooldown(c => (c <= 0 ? 0 : c - 1)), 1000)
    return () => clearInterval(t)
  }, [step])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await requestOrganizerSignup({ fullName, email, password })
    setLoading(false)
    if (!res.ok) {
      // Structured discriminants, not error.message parsing: prod redacts thrown
      // Server Action messages to an opaque digest.
      if (res.error === 'invalid_name') setError('Veuillez remplir tous les champs.')
      else if (res.error === 'invalid_email') setError('Veuillez saisir une adresse e-mail valide.')
      else if (res.error === 'rate_limited') {
        setError('Trop de tentatives depuis cette connexion. Réessayez dans une heure.')
      } else {
        setError(res.message ?? 'La création du compte a échoué. Réessayez dans un instant.')
      }
      return
    }
    if (res.state === 'waitlisted') { setStep('waitlisted'); return }
    setConfirmEmail(email.trim().toLowerCase())
    setCooldown(RESEND_COOLDOWN)
    setStep('confirm')
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
    setStep('form')
    setResendError(null)
    setResendNote(null)
    setCooldown(0)
  }

  if (step === 'waitlisted') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
        <Logo href="/" />
        <AuthCard maxWidth={460} className="flex flex-col gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E7EDFD] text-[#2456E6]">
            <Clock className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
            Vous êtes sur la liste d’attente
          </h3>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Merci de votre intérêt. Eazyexchange n’est pas encore ouvert à tous : nous
            avons enregistré votre adresse et nous vous écrirons dès que l’accès sera
            disponible.
          </p>
          <p className="m-0 text-[15px] leading-relaxed text-[#5B6B8C]">
            Une question d’ici là ?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-[#2456E6] hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </AuthCard>
      </div>
    )
  }

  if (step === 'confirm') {
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
