'use client'
import { useState } from 'react'
import { createDraftTemplate } from '@/actions/forms'

type Mode = 'pdf' | 'online'

// Inline dashed add panel per handoff: two tiles; clicking one flips to a
// short form (name, échéance optionnelle, PDF file when needed).
export function AddFormPanel({
  exchangeId, onClose, onCreated,
}: {
  exchangeId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('exchange_id', exchangeId)
      fd.set('kind', mode)
      fd.set('name', name)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'pdf' && file) fd.set('file', file)
      const id = await createDraftTemplate(fd)
      onCreated(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-frame bg-hoverrow p-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">Ajouter un formulaire</div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="h-[26px] w-[26px] rounded-[7px] border bg-card text-[13px] text-tertiary">✕</button>
      </div>

      {mode === null ? (
        <div className="grid grid-cols-2 gap-3.5">
          <button type="button" onClick={() => setMode('pdf')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-rail">
              <div className="flex h-[19px] w-[15px] flex-col justify-center gap-[2px] rounded-[2px] border-[1.6px] border-white px-[3px]"><div className="h-[1.6px] bg-white" /><div className="h-[1.6px] w-[70%] bg-white" /><div className="h-[1.6px] bg-white" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">Importer un PDF</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Téléversez un document que les familles impriment, signent et renvoient.</div>
            <span className="mt-0.5 rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">Téléverser un PDF</span>
          </button>
          <button type="button" onClick={() => setMode('online')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-brand">
              <div className="flex h-[19px] w-[15px] flex-col justify-center gap-[2.5px] rounded-[2px] border-[1.6px] border-white px-[3px]"><div className="h-[1.5px] bg-white" /><div className="h-[1.5px] bg-white" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">Créer un formulaire en ligne</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Composez vos propres questions — remplies directement dans l’application.</div>
            <span className="mt-0.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">Composer les questions</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-form-name" className="text-[13px] font-semibold text-navy">Nom du formulaire</label>
              <input id="add-form-name" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder={mode === 'pdf' ? 'Autorisation parentale' : 'Questionnaire famille'}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-form-deadline" className="text-[13px] font-semibold text-navy">Échéance (facultatif)</label>
              <input id="add-form-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
            </div>
          </div>
          {mode === 'pdf' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="add-form-file" className="text-[13px] font-semibold text-navy">PDF à faire signer</label>
              <input id="add-form-file" type="file" accept="application/pdf" required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-[13px] text-muted-foreground" />
            </div>
          )}
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <div className="flex gap-2.5">
            <button type="submit" disabled={busy} className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Création…' : 'Créer le brouillon'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-[9px] px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">Retour</button>
          </div>
        </form>
      )}
    </div>
  )
}
