'use client'
import { useState } from 'react'
import { deleteTemplate } from '@/actions/forms'

// Row-level delete for a custom template. Reuses the drawer's window.confirm
// pattern; the caller passes family-specific wording via confirmText. On
// success the action's revalidation unmounts the parent row, so busy is not cleared.
export function DeleteTemplateButton({
  templateId, confirmText,
}: {
  templateId: string
  confirmText: string
}) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    try {
      await deleteTemplate(templateId)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Une erreur est survenue.')
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={busy}
      className="rounded-lg border border-frame-dashed bg-card px-3.5 py-2 text-[12.5px] font-semibold text-danger-text hover:bg-hoverrow disabled:opacity-60">
      {busy ? 'Suppression…' : 'Supprimer'}
    </button>
  )
}
