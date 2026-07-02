'use client'
import { useState } from 'react'
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

export function NewExchangeModal({
  open,
  onOpenChange,
  needsSchoolName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  needsSchoolName: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await createExchange(new FormData(e.currentTarget))
      onOpenChange(false)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
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
          {needsSchoolName && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school_a_name">Votre établissement</Label>
              <Input id="school_a_name" name="school_a_name" required className="h-12" />
            </div>
          )}
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
