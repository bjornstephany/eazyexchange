'use client'
import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import { downloadApplicationRecap } from '@/actions/apply'

// Bilingual copy inline, matching ApplicationForm's `T` convention — the public
// apply funnel does not go through next-intl.
const T = {
  en: {
    label: 'Download my answers (PDF)',
    preparing: 'Preparing…',
    not_found: 'This link is no longer valid — ask your organizer for a new one.',
    expired: 'This link has expired — ask your organizer for a new one.',
    not_submitted: 'Your application has not been submitted yet.',
    unexpected: 'The download failed. Please try again.',
  },
  fr: {
    label: 'Télécharger mes réponses (PDF)',
    preparing: 'Préparation…',
    not_found: 'Ce lien n’est plus valide — demande un nouveau lien à ton organisateur.',
    expired: 'Ce lien a expiré — demande un nouveau lien à ton organisateur.',
    not_submitted: 'Ta candidature n’a pas encore été envoyée.',
    unexpected: 'Le téléchargement a échoué. Réessaie.',
  },
}

export function ApplicationRecapButton({ token, language }: { token: string; language: 'en' | 'fr' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = T[language]

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const res = await downloadApplicationRecap(token, language)
      if (!res.ok) {
        // Structured reason, never a thrown message (prod redacts those).
        setError(t[res.reason])
        return
      }
      const bytes = Uint8Array.from(atob(res.pdf), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = res.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(t.unexpected)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-[11px] border border-[#C4CDE0] bg-white px-5 py-3 text-[14px] font-semibold text-[#10203F] hover:bg-[#F4F7FC] disabled:opacity-60"
      >
        <DownloadIcon aria-hidden size={16} strokeWidth={1.75} />
        {busy ? t.preparing : t.label}
      </button>
      {error && <p role="alert" className="m-0 text-[13px] text-[#C0392B]">{error}</p>}
    </div>
  )
}
