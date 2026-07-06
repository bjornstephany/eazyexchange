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

export function NewExchangeModal({
  open,
  onOpenChange,
  isTrial = false,
  remaining = Infinity,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isTrial?: boolean
  remaining?: number
}) {
  const notice = exchangeNoticeMessage({ isTrial, remaining })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (open) {
      setError(null)
      setLoading(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await createExchange(new FormData(e.currentTarget))
      if (result.ok) {
        onOpenChange(false)
        router.push('/dashboard')
        return
      }
      if (result.error === 'limit') {
        // At the plan's exchange cap — send them straight to the offers page.
        onOpenChange(false)
        router.push('/billing')
        return
      }
      // Invalid input (expected): show it inline, keep the dialog open.
      setError(result.message)
    } catch {
      // Genuinely unexpected failure. In production Next.js redacts the thrown
      // message, so surface a clean generic one rather than the opaque digest.
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
            Un échange relie votre établissement à un partenaire, pour une session donnée.
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
            <Label htmlFor="name">Nom de l&apos;échange</Label>
            <Input id="name" name="name" placeholder="France–Canada 2026" required className="h-12" />
          </div>
          <div className="grid grid-cols-[150px_1fr] gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="year">Année</Label>
              <Input
                id="year"
                name="year"
                type="number"
                defaultValue={new Date().getFullYear()}
                required
                className="h-12"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school_b_name">Établissement partenaire</Label>
              <Input
                id="school_b_name"
                name="school_b_name"
                placeholder="Lycée Victor Hugo"
                required
                className="h-12"
              />
            </div>
          </div>
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
              {loading ? 'Création…' : "Créer l'échange"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
