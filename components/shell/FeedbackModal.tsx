'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { submitFeedback } from '@/actions/feedback'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type FeedbackType = 'suggestion' | 'bug'

export function FeedbackModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [type, setType] = useState<FeedbackType>('suggestion')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  // Reset every time the dialog opens.
  useEffect(() => {
    if (open) {
      setType('suggestion')
      setMessage('')
      setError(null)
      setLoading(false)
      setSent(false)
    }
  }, [open])

  // Auto-close shortly after the merci state appears.
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => onOpenChange(false), 1500)
    return () => clearTimeout(t)
  }, [sent, onOpenChange])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await submitFeedback({
        type,
        message,
        pagePath: typeof window !== 'undefined' ? window.location.pathname : null,
      })
      if (result.ok) {
        setSent(true)
        return
      }
      setError(result.error)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  const pill = (value: FeedbackType, label: string) => (
    <button
      type="button"
      onClick={() => setType(value)}
      className={cn(
        'rounded-pill px-4 py-1.5 text-[13px] font-semibold',
        type === value ? 'bg-brand text-white' : 'bg-subtle text-muted-foreground hover:bg-hoverrow'
      )}
    >
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
            Une suggestion ? Un problème ?
          </DialogTitle>
        </DialogHeader>
        {sent ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-muted px-3.5 py-6 text-center text-sm text-foreground"
          >
            Merci ! Votre message a bien été envoyé.
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <div className="flex gap-2.5">
              {pill('suggestion', 'Suggestion')}
              {pill('bug', 'Bug ou problème')}
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décrivez votre idée ou le problème rencontré…"
              maxLength={2000}
              required
              className="min-h-[130px]"
            />
            {error && <p className="text-sm text-danger-text">{error}</p>}
            <div className="mt-1.5 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-muted-foreground"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
