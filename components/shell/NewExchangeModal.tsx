'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createExchange } from '@/actions/exchanges'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { exchangeNoticeMessage } from '@/lib/billing/exchange-notice'
import { normalizeEmail, isValidEmail } from '@/lib/validation'

export function NewExchangeModal({
  open,
  onOpenChange,
  isTrial = false,
  remaining = Infinity,
  isOwner = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isTrial?: boolean
  remaining?: number
  isOwner?: boolean
}) {
  const notice = exchangeNoticeMessage({ isTrial, remaining })
  const [error, setError] = useState<string | null>(null)
  const [inviteErrors, setInviteErrors] = useState<{ email: string; message: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [chips, setChips] = useState<string[]>([])
  const router = useRouter()

  useEffect(() => {
    if (open) {
      setError(null)
      setInviteErrors([])
      setLoading(false)
      setShowInvite(false)
      setEmailDraft('')
      setEmailError(null)
      setChips([])
    }
  }, [open])

  function addChip() {
    const email = normalizeEmail(emailDraft)
    if (!isValidEmail(email)) { setEmailError('Adresse e-mail invalide.'); return }
    setChips(prev => prev.includes(email) ? prev : [...prev, email]) // dedupe
    setEmailDraft('')
    setEmailError(null)
  }

  function removeChip(email: string) {
    setChips(prev => prev.filter(e => e !== email))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInviteErrors([])
    try {
      const result = await createExchange(new FormData(e.currentTarget))
      if (result.ok) {
        if (result.inviteErrors && result.inviteErrors.length > 0) {
          // Exchange created; some invites failed. Show them, then move on.
          setInviteErrors(result.inviteErrors)
          setLoading(false)
          return
        }
        onOpenChange(false)
        router.push('/dashboard')
        return
      }
      if (result.error === 'limit') {
        onOpenChange(false)
        router.push('/billing')
        return
      }
      setError(result.message)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
            Nouvel échange
          </DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            Donnez un nom à votre échange pour commencer.
          </DialogDescription>
        </DialogHeader>
        {notice && (
          <p
            role="note"
            className={
              notice.tone === 'warning'
                ? 'rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900'
                : 'rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground'
            }
          >
            {notice.message}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom de l’échange</Label>
            <Input id="name" name="name" placeholder="Espagne 2026" required className="h-12" />
          </div>

          {isOwner && (
            <div className="flex flex-col gap-2">
              {!showInvite ? (
                <button
                  type="button"
                  onClick={() => setShowInvite(true)}
                  className="self-start text-[13px] font-semibold text-brand hover:text-brand-hover"
                >
                  + Inviter un collaborateur (optionnel)
                </button>
              ) : (
                <>
                  <Label htmlFor="invite">Inviter un collaborateur (optionnel)</Label>
                  <div className="flex gap-2.5">
                    <Input
                      id="invite"
                      value={emailDraft}
                      onChange={e => setEmailDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChip() } }}
                      placeholder="adresse@etablissement.fr"
                      className="h-11"
                    />
                    <Button type="button" variant="secondary" onClick={addChip} className="h-11 flex-none">
                      Ajouter
                    </Button>
                  </div>
                  {emailError && <p className="text-sm text-danger-text">{emailError}</p>}
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {chips.map(email => (
                        <span key={email} className="flex items-center gap-1.5 rounded-pill bg-subtle px-3 py-1 text-[12.5px] font-medium text-foreground">
                          {email}
                          <button
                            type="button"
                            aria-label={`Retirer ${email}`}
                            onClick={() => removeChip(email)}
                            className="text-tertiary hover:text-danger-text"
                          >
                            ×
                          </button>
                          <input type="hidden" name="invite_email" value={email} />
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-danger-text">{error}</p>}
          {inviteErrors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
              <p className="mb-1 font-semibold">L’échange est créé, mais certaines invitations ont échoué :</p>
              <ul className="list-disc pl-5">
                {inviteErrors.map(ie => (
                  <li key={ie.email}>{ie.email} — {ie.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-1.5 flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (inviteErrors.length > 0) { onOpenChange(false); router.push('/dashboard'); return }
                onOpenChange(false)
              }}
              className="text-muted-foreground"
            >
              {inviteErrors.length > 0 ? 'Continuer' : 'Annuler'}
            </Button>
            {inviteErrors.length === 0 && (
              <Button type="submit" disabled={loading}>
                {loading ? 'Création…' : 'Créer l’échange'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
