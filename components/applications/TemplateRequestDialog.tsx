'use client'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { submitTemplateRequest, type TemplateRequestReason } from '@/actions/template-request'
import {
  templateRequestFileIssue, TEMPLATE_REQUEST_ACCEPT, TEMPLATE_REQUEST_NOTE_MAX,
} from '@/lib/template-request'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// « Uploadez le formulaire que vous utilisez déjà, on l'ajoute sous 48 h. »
//
// The file is mailed to us and never stored, so there is nothing to come back
// to and nothing to delete: one shot, then a merci state. The copy asks for a
// BLANK form on purpose — a filled one would carry students' data into an inbox
// that is not part of this app's retention lifecycle.
export function TemplateRequestDialog({
  open, onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const s = useTranslations('organizer.applications.setup')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{s('requestTitle')}</DialogTitle>
          <DialogDescription>{s('requestDialogBody')}</DialogDescription>
        </DialogHeader>
        {/* All the transient state lives one level down, inside the content
            Radix unmounts on close — so a previous failure can never greet the
            next attempt, and no reset effect is needed to guarantee it. */}
        <RequestForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const s = useTranslations('organizer.applications.setup')
  const c = useTranslations('common')
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<TemplateRequestReason | null>(null)
  const [sent, setSent] = useState(false)

  function pick(next: File | null) {
    setError(null)
    // Same check the action runs. Here it is only to fail fast — a 3 MB cap
    // enforced by the browser alone would be no cap at all.
    const issue = templateRequestFileIssue(next)
    if (next && issue) {
      setFile(null)
      setError(issue)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setFile(next)
  }

  async function submit() {
    if (!file || busy) return
    setBusy(true); setError(null)
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('note', note)
      const res = await submitTemplateRequest(body)
      // Structured outcome, never a thrown message: production redacts those to
      // an opaque digest.
      if (!res.ok) { setError(res.reason); return }
      setSent(true)
    } catch {
      setError('failed')
    } finally { setBusy(false) }
  }

  if (sent) {
    return (
      <div>
        <p className="text-[14px] text-navy">{s('requestSent')}</p>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={onDone}>{c('actions.close')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-request-file">{s('requestFileLabel')}</Label>
        <input
          ref={inputRef}
          id="template-request-file"
          type="file"
          accept={TEMPLATE_REQUEST_ACCEPT}
          disabled={busy}
          onChange={e => pick(e.target.files?.[0] ?? null)}
          className="text-[13px] file:mr-3 file:rounded-[8px] file:border file:bg-card file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-navy"
        />
        {/* Not a legal disclaimer, a working instruction: an organizer reaching
            for « le formulaire qu'on utilise » may well pick one a family
            already filled in. */}
        <p className="m-0 text-[12px] text-muted-foreground">{s('requestPrivacyHint')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="template-request-note">{s('requestNoteLabel')}</Label>
        <Textarea
          id="template-request-note"
          value={note}
          maxLength={TEMPLATE_REQUEST_NOTE_MAX}
          disabled={busy}
          onChange={e => setNote(e.target.value)}
          rows={3}
        />
      </div>

      {error && <p className="m-0 text-[13px] text-danger-text">{s(`requestErrors.${error}`)}</p>}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone} className="text-muted-foreground">
          {c('actions.cancel')}
        </Button>
        <Button type="button" disabled={!file || busy} onClick={() => void submit()}>
          {busy ? s('requestSending') : s('requestSubmitCta')}
        </Button>
      </div>
    </div>
  )
}
