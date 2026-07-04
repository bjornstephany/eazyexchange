'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { recordDocumentUpload, submitDocumentAssignment } from '@/actions/submissions'
import { validateUploadFile, ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { DocumentSlot } from '@/types/db'

interface Upload { slot_id: string; file_name: string; storage_path: string }

interface Props {
  assignmentId: string
  slots: DocumentSlot[]
  initialUploads: Upload[]
  readOnly: boolean
}

export function DocumentUploadForm({ assignmentId, slots, initialUploads, readOnly }: Props) {
  const [uploads, setUploads] = useState<Record<string, Upload>>(
    Object.fromEntries(initialUploads.map(u => [u.slot_id, u]))
  )
  const [uploading, setUploading] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleFileChange(slot: DocumentSlot, file: File) {
    const validationError = validateUploadFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setUploading(slot.id)
    setError(null)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_')
      const path = `${assignmentId}/${slot.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      await recordDocumentUpload(assignmentId, slot.id, path, file.name)
      setUploads(prev => ({ ...prev, [slot.id]: { slot_id: slot.id, file_name: file.name, storage_path: path } }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement')
    } finally {
      setUploading(null)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await submitDocumentAssignment(assignmentId)
      router.push('/my-forms')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi')
      setSubmitting(false)
    }
  }

  const requiredSlots = slots.filter(s => s.required)
  const allRequiredUploaded = requiredSlots.every(s => uploads[s.id])

  return (
    <div className="space-y-4">
      {slots.map(slot => {
        const upload = uploads[slot.id]
        const isUploading = uploading === slot.id

        return (
          <div key={slot.id} className="rounded-[14px] border bg-card p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[14px] font-semibold text-navy">
                  {slot.label}
                  {slot.required && <span className="ml-1 text-danger-text">*</span>}
                </p>
                {slot.description && (
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{slot.description}</p>
                )}
              </div>
              {upload && <Badge variant="info">Envoyé</Badge>}
            </div>

            {upload && (
              <p className="mb-2 flex items-center gap-2 rounded-[9px] bg-hoverrow px-3 py-2 text-[12.5px] text-foreground">
                <span aria-hidden>📄</span>{upload.file_name}
              </p>
            )}

            {!readOnly && (
              <label className="block cursor-pointer">
                <input
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_UPLOAD_ACCEPT}
                  disabled={isUploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileChange(slot, file)
                  }}
                />
                {upload ? (
                  <span className="inline-flex items-center gap-1.5 rounded-[9px] border px-3.5 py-2 text-[12.5px] font-semibold text-foreground hover:bg-hoverrow">
                    {isUploading ? 'Téléversement…' : 'Remplacer le fichier'}
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-frame-dashed bg-hoverrow px-5 py-8 text-center hover:border-brand">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-tint text-xl font-bold text-tint-text" aria-hidden>↑</span>
                    <span className="text-[14px] font-semibold text-navy">{isUploading ? 'Téléversement…' : 'Clique pour choisir un fichier'}</span>
                    <span className="font-mono text-[11.5px] text-placeholder">PDF · JPG · PNG — 10 Mo max</span>
                  </span>
                )}
              </label>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <p className="text-[11.5px] leading-relaxed text-placeholder">
          Ta pièce sera vérifiée par l’équipe du programme avant validation.
        </p>
      )}

      {error && <p className="text-sm text-danger-text">{error}</p>}

      {!readOnly && (
        <Button
          onClick={handleSubmit}
          disabled={!allRequiredUploaded || submitting}
          className="mt-2 bg-brand hover:bg-brand-hover"
        >
          {submitting ? 'Envoi…' : 'Envoyer'}
        </Button>
      )}
      {!readOnly && !allRequiredUploaded && (
        <p className="text-[12.5px] text-muted-foreground">Ajoute toutes les pièces requises pour envoyer.</p>
      )}
    </div>
  )
}
