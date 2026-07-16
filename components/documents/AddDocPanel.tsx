'use client'
import { useState } from 'react'
import { createDraftTemplate } from '@/actions/forms'

type Mode = 'all' | 'conditional'

// Inline dashed add panel: « Obligatoire pour tous » / « Selon la situation »,
// then a short creation form.
export function AddDocPanel({
  exchangeId, onClose, onCreated,
}: {
  exchangeId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [name, setName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [condition, setCondition] = useState('')
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
      fd.set('kind', 'doc')
      fd.set('name', name)
      fd.set('audience', mode)
      if (deadline) fd.set('deadline', deadline)
      if (mode === 'conditional' && condition) fd.set('condition_label', condition)
      const res = await createDraftTemplate(fd)
      if (!res.ok) {
        setError(res.message)
        setBusy(false)
        return
      }
      onCreated(res.id)
    } catch {
      setError('Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-[14px] border border-dashed border-frame bg-hoverrow p-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-tertiary">Demander un document</div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="h-[26px] w-[26px] rounded-[7px] border bg-card text-[13px] text-tertiary">✕</button>
      </div>

      {mode === null ? (
        <div className="grid grid-cols-2 gap-3.5">
          <button type="button" onClick={() => setMode('all')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-rail">
              <div className="relative h-4 w-[15px]"><div className="absolute left-0 top-0 h-[13px] w-2.5 rounded-[2px] border-[1.6px] border-white" /><div className="absolute bottom-0 right-0 h-[13px] w-2.5 rounded-[2px] border-[1.6px] border-white bg-rail" /></div>
            </div>
            <div className="font-display text-[15px] font-semibold text-navy">Obligatoire pour tous</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Demandé à chaque élève confirmé — compte dans la complétude du dossier.</div>
            <span className="mt-0.5 rounded-lg bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">Ajouter la pièce</span>
          </button>
          <button type="button" onClick={() => setMode('conditional')} className="flex flex-col items-start gap-2.5 rounded-xl border bg-card p-[18px] text-left hover:border-brand">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted-foreground font-display text-base font-bold text-white">?</div>
            <div className="font-display text-[15px] font-semibold text-navy">Selon la situation</div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">Demandé uniquement aux élèves concernés — vous choisissez qui, sans pénaliser les autres dossiers.</div>
            <span className="mt-0.5 rounded-lg bg-subtle px-3.5 py-2 text-[12.5px] font-semibold text-navy">Ajouter la pièce</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-name" className="text-[13px] font-semibold text-navy">Nom de la pièce</label>
              <input id="add-doc-name" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="Carte européenne d’assurance maladie"
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-deadline" className="text-[13px] font-semibold text-navy">Échéance (facultatif)</label>
              <input id="add-doc-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] focus:border-brand focus:outline-none" />
            </div>
          </div>
          {mode === 'conditional' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="add-doc-cond" className="text-[13px] font-semibold text-navy">Condition (facultatif)</label>
              <input id="add-doc-cond" value={condition} onChange={(e) => setCondition(e.target.value)}
                placeholder="si parents divorcés"
                className="h-11 rounded-[10px] border border-frame bg-card px-3 text-[15px] placeholder:text-placeholder focus:border-brand focus:outline-none" />
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
