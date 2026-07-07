'use client'
import { useEffect, useState } from 'react'
import { setApplicationOpen } from '@/actions/exchanges'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function InviteModal({
  exchangeId,
  applySlug,
  open,
  onOpenChange,
}: {
  exchangeId: string
  applySlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<'deadline' | 'link'>('deadline')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCloseWarning, setShowCloseWarning] = useState(false)
  const [copied, setCopied] = useState(false)

  // Reset transient state each time the modal is opened.
  useEffect(() => {
    if (open) {
      setStep('deadline')
      setDeadline('')
      setSaving(false)
      setShowCloseWarning(false)
      setCopied(false)
    }
  }, [open])

  const applyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/apply/${applySlug}`
      : `/apply/${applySlug}`

  async function openApplications() {
    if (!deadline) return
    setSaving(true)
    try {
      await setApplicationOpen(exchangeId, true, deadline)
      setStep('link')
    } finally {
      setSaving(false)
    }
  }

  function close() {
    onOpenChange(false)
  }

  // Every close path (X, Escape, backdrop, explicit button) routes here so the
  // link step can intercept and warn before actually closing.
  function requestClose() {
    if (step === 'link' && !copied && !showCloseWarning) {
      setShowCloseWarning(true)
      return
    }
    close()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setShowCloseWarning(false)
    } catch {
      /* best-effort: field is selectable for manual copy */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
      <DialogContent className="max-w-[520px] rounded-card p-[34px] px-[38px] shadow-modal sm:rounded-card">
        {step === 'deadline' ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
                Inviter vos élèves
              </DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground">
                Choisissez une date limite. Les candidatures ouvriront aussitôt.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-deadline">Date limite des candidatures</Label>
              <Input
                id="invite-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="mt-1.5 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => close()} className="text-muted-foreground">
                Annuler
              </Button>
              <Button type="button" disabled={!deadline || saving} onClick={openApplications}>
                {saving ? 'Ouverture…' : 'Ouvrir les candidatures'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight text-navy">
                Candidatures ouvertes&nbsp;✓
              </DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground">
                Partagez ce lien avec les élèves que vous souhaitez inviter à postuler.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-link">Lien de candidature</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link"
                  readOnly
                  value={applyUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-12"
                />
                <Button type="button" variant="outline" onClick={copy} className="h-12 whitespace-nowrap">
                  {copied ? 'Copié ✓' : 'Copier'}
                </Button>
              </div>
            </div>
            {showCloseWarning && (
              <div className="mt-3 rounded-[10px] border border-[#F0C674] bg-[#FDF6E7] px-3.5 py-2.5 text-[13px] font-medium text-[#8A6100]">
                Vous ne reverrez plus ce lien — copiez-le avant de fermer.
              </div>
            )}
            <div className="mt-1.5 flex justify-end">
              <Button type="button" onClick={requestClose}>
                {showCloseWarning ? 'Fermer quand même' : 'Fermer'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
