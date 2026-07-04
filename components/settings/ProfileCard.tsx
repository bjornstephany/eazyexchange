'use client'
import { useRef, useState } from 'react'
import { updateProfile } from '@/actions/settings'

const AVATAR_GRADIENT = 'linear-gradient(135deg,#3B6EF6,#0E1B38)' // handoff constant

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('')
}

export function ProfileCard({ profile, isOwner }: {
  profile: { fullName: string; email: string; schoolName: string }
  isOwner: boolean
}) {
  const [f, setF] = useState({
    fullName: profile.fullName, schoolName: profile.schoolName,
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  async function handleSave() {
    setBusy(true); setError(null)
    try {
      await updateProfile(f)
      setSaved(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setBusy(false)
  }

  const fields: { key: keyof typeof f | 'email'; label: string; disabled?: boolean; hint?: string }[] = [
    { key: 'fullName', label: 'Nom complet' },
    { key: 'email', label: 'Adresse e-mail', disabled: true, hint: 'Contactez le support pour changer d’adresse.' },
    {
      key: 'schoolName', label: 'Établissement', disabled: !isOwner,
      hint: isOwner ? undefined : 'Seul le propriétaire peut modifier le nom de l’établissement.',
    },
  ]

  return (
    <div className="rounded-2xl border bg-card px-7 py-[26px]">
      <div className="mb-[22px] flex items-center gap-[15px]">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{ background: AVATAR_GRADIENT }}
        >
          {initialsOf(f.fullName || profile.fullName)}
        </span>
        <div>
          <div className="font-display text-[17px] font-bold tracking-[-.01em] text-foreground">{f.fullName}</div>
          <div className="mt-0.5 text-[13px] text-tertiary">
            {f.schoolName}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-[15px] sm:grid-cols-2">
        {fields.map(fl => (
          <div key={fl.key}>
            <label htmlFor={`pf-${fl.key}`} className="mb-1.5 block text-xs font-semibold text-foreground">{fl.label}</label>
            <input
              id={`pf-${fl.key}`}
              value={fl.key === 'email' ? profile.email : f[fl.key as keyof typeof f]}
              disabled={fl.disabled}
              onChange={e => setF({ ...f, [fl.key]: e.target.value })}
              className="h-10 w-full rounded-[9px] border px-3 text-[13.5px] focus:border-brand focus:outline-none disabled:bg-hoverrow disabled:text-muted-foreground"
            />
            {fl.hint && <p className="mt-1 text-[11px] text-placeholder">{fl.hint}</p>}
          </div>
        ))}
      </div>
      <div className="mt-[22px] flex items-center justify-end gap-3.5">
        {error && <span className="text-[12.5px] font-medium text-danger-text">{error}</span>}
        {saved && <span className="text-[12.5px] font-medium text-success-text">✓ Modifications enregistrées</span>}
        <button
          type="button" onClick={handleSave} disabled={busy}
          className="rounded-[9px] bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}
