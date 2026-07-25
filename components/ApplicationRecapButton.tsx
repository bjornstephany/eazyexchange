'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DownloadIcon } from 'lucide-react'
import { downloadApplicationRecap } from '@/actions/apply'
import type { Locale } from '@/lib/i18n/config'

export function ApplicationRecapButton({ token, language }: { token: string; language: Locale }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('apply')

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const res = await downloadApplicationRecap(token, language)
      if (!res.ok) {
        // Structured reason, never a thrown message (prod redacts those).
        // Same `apply.errors` group as the rest of the funnel.
        setError(t(`errors.${res.reason}`))
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
      setError(t('errors.failed'))
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
        {busy ? t('recap.preparing') : t('recap.label')}
      </button>
      {error && <p role="alert" className="m-0 text-[13px] text-[#C0392B]">{error}</p>}
    </div>
  )
}
