'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { recordDocumentUpload, submitDocumentAssignment } from '@/actions/submissions'
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
    } catch (err: any) {
      setError(err.message ?? 'Upload failed')
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
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit')
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
          <div key={slot.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium text-sm">
                  {slot.label}
                  {slot.required && <span className="text-red-500 ml-1">*</span>}
                </p>
                {slot.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{slot.description}</p>
                )}
              </div>
              {upload && <Badge variant="secondary">Uploaded</Badge>}
            </div>

            {upload && (
              <p className="text-xs text-slate-600 mb-2">📄 {upload.file_name}</p>
            )}

            {!readOnly && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileChange(slot, file)
                  }}
                />
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 border rounded px-3 py-1.5 hover:bg-slate-50 transition-colors">
                  {isUploading ? 'Uploading…' : upload ? 'Replace file' : 'Upload file'}
                </span>
              </label>
            )}
          </div>
        )
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!readOnly && (
        <Button
          onClick={handleSubmit}
          disabled={!allRequiredUploaded || submitting}
          className="mt-2"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
      )}
      {!readOnly && !allRequiredUploaded && (
        <p className="text-xs text-slate-500">Upload all required documents to submit.</p>
      )}
    </div>
  )
}
