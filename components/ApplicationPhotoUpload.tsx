'use client'
import { useRef, useState } from 'react'
import { uploadApplicationPhoto } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'

const T = {
  en: { label: "Recent photo", choose: "Choose a photo", replace: "Replace the photo", hint: "JPEG, PNG or WebP — 10 MB max.", uploading: "Uploading…", failed: "Upload failed. Please try again.", required: "A photo is required to submit your application." },
  fr: { label: "Photo récente", choose: "Choisir une photo", replace: "Remplacer la photo", hint: "JPEG, PNG ou WebP — 10 Mo max.", uploading: "Envoi…", failed: "L’envoi a échoué. Réessaie.", required: "Une photo est requise pour envoyer ta candidature." },
}

interface Props {
  token: string
  initialPhotoUrl: string | null
  lang: 'en' | 'fr'
  invalid: boolean
  onUploaded: () => void
}

export function ApplicationPhotoUpload({ token, initialPhotoUrl, lang, invalid, onUploaded }: Props) {
  const [preview, setPreview] = useState<string | null>(initialPhotoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const t = T[lang]

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    const fd = new FormData()
    fd.set('photo', file)
    try {
      await uploadApplicationPhoto(token, fd)
      setPreview(URL.createObjectURL(file))
      onUploaded()
    } catch {
      setError(t.failed)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div id="field-photo" className={`flex items-center gap-5 rounded-[14px] border bg-[#FAFBFE] px-5 py-4 ${invalid ? 'border-[#C0392B]' : 'border-[#E4E9F2]'}`}>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob / signed Supabase URL, next/image adds nothing
        <img src={preview} alt={t.label} className="h-24 w-24 shrink-0 rounded-full border border-[#E4E9F2] object-cover" />
      ) : (
        <span aria-hidden className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#EDF1F8]">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8A97B2" strokeWidth="1.5">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13.5px] font-semibold text-[#42506E]">{t.label}<span className="ml-1 text-[#C0392B]">*</span></span>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()} className="h-10 self-start rounded-[10px] border-[#C4CDE0] px-4 text-sm font-semibold text-[#10203F]">
          {uploading ? t.uploading : preview ? t.replace : t.choose}
        </Button>
        <input ref={inputRef} type="file" accept={ALLOWED_UPLOAD_ACCEPT} aria-label={t.label} onChange={onFile} className="hidden" />
        <p className="m-0 text-xs text-[#8A97B2]">{t.hint}</p>
        {error && <p className="m-0 text-xs text-[#C0392B]">{error}</p>}
        {invalid && !error && <p className="m-0 text-xs text-[#C0392B]">{t.required}</p>}
      </div>
    </div>
  )
}
