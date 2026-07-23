'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { peekApplicationDraft } from '@/actions/apply'
import { readResumeToken, clearResumeToken } from '@/lib/apply-storage'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/lib/i18n/config'

type View =
  | { kind: 'loading' }
  | { kind: 'start' }
  | { kind: 'welcome'; token: string; firstName: string | null }

export function ApplyEntry({ slug, locale }: { slug: string; locale: Locale }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const t = useTranslations('apply')
  const router = useRouter()

  useEffect(() => {
    const token = readResumeToken(slug)
    if (!token) { setView({ kind: 'start' }); return }
    let cancelled = false
    peekApplicationDraft(token)
      .then(res => {
        if (cancelled) return
        if (res.live) {
          setView({ kind: 'welcome', token, firstName: res.firstName })
        } else {
          clearResumeToken(slug)
          setView({ kind: 'start' })
        }
      })
      .catch(() => { if (!cancelled) setView({ kind: 'start' }) })
    return () => { cancelled = true }
  }, [slug])

  if (view.kind === 'loading') {
    return <p className="text-[15px] text-[#8A97B2]">…</p>
  }
  if (view.kind === 'start') {
    return <ApplicationStartForm slug={slug} locale={locale} />
  }

  // `, Léa` or `` — punctuation kept in code, not copy (the ICU key is just
  // `Bon retour{name} !`).
  const name = view.firstName ? `, ${view.firstName}` : ''
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        <h2 className="m-0 mb-1.5 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          {t('welcome.title', { name })}
        </h2>
        <p className="m-0 mb-6 text-[15px] text-[#5B6B8C]">
          {t('welcome.body')}
        </p>
        <Button
          onClick={() => router.push(`/apply/resume/${view.token}`)}
          className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]"
        >
          {t('welcome.continue')}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => { clearResumeToken(slug); setView({ kind: 'start' }) }}
        className="self-start text-[13px] font-medium text-[#8A97B2] underline underline-offset-2 hover:text-[#5B6B8C]"
      >
        {t('welcome.notYou')}
      </button>
    </div>
  )
}
