'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { acceptOrganizerInvite } from '@/actions/join'

export function JoinForm({ token, email, schoolName }: { token: string; email: string; schoolName: string }) {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    setBusy(true)
    try {
      await acceptOrganizerInvite(token, fullName, password)
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError('Compte créé — connectez-vous avec votre nouveau mot de passe.'); setBusy(false); return }
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border bg-card p-7">
      <h1 className="font-display text-xl font-bold tracking-tight text-navy">Rejoindre l’équipe</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Vous êtes invité·e à rejoindre <span className="font-semibold text-foreground">{schoolName || 'un établissement'}</span> sur
        Eazyexchange, avec l’adresse <span className="font-medium text-foreground">{email}</span>.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="space-y-1">
          <label htmlFor="join-name" className="text-xs font-semibold text-foreground">Nom complet</label>
          <input id="join-name" value={fullName} onChange={e => setFullName(e.target.value)} required
            className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label htmlFor="join-pw" className="text-xs font-semibold text-foreground">Mot de passe</label>
          <input id="join-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
            className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none" />
        </div>
        <div className="space-y-1">
          <label htmlFor="join-cf" className="text-xs font-semibold text-foreground">Confirmer le mot de passe</label>
          <input id="join-cf" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8}
            className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none" />
        </div>
        {error && <p className="text-sm text-danger-text">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full rounded-[9px] bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
          {busy ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
    </div>
  )
}