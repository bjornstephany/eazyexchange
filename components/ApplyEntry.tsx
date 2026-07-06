'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { peekApplicationDraft } from '@/actions/applications'
import { readResumeToken, clearResumeToken } from '@/lib/apply-storage'
import { ApplicationStartForm } from '@/components/ApplicationStartForm'
import { Button } from '@/components/ui/button'

type View =
  | { kind: 'loading' }
  | { kind: 'start' }
  | { kind: 'welcome'; token: string; firstName: string | null; language: 'en' | 'fr' }

export function ApplyEntry({ slug }: { slug: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const router = useRouter()

  useEffect(() => {
    const token = readResumeToken(slug)
    if (!token) { setView({ kind: 'start' }); return }
    let cancelled = false
    peekApplicationDraft(token)
      .then(res => {
        if (cancelled) return
        if (res.live) {
          setView({ kind: 'welcome', token, firstName: res.firstName, language: res.language })
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
    return <ApplicationStartForm slug={slug} />
  }

  const fr = view.language === 'fr'
  const name = view.firstName ? `, ${view.firstName}` : ''
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        <h2 className="m-0 mb-1.5 font-display text-[22px] font-bold tracking-[-0.02em] text-[#10203F]">
          {fr ? `Bon retour${name} !` : `Welcome back${name}!`}
        </h2>
        <p className="m-0 mb-6 text-[15px] text-[#5B6B8C]">
          {fr ? 'Reprends ta candidature là où tu t’es arrêté·e.' : 'Pick up your application where you left off.'}
        </p>
        <Button
          onClick={() => router.push(`/apply/resume/${view.token}`)}
          className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]"
        >
          {fr ? 'Continuer ma candidature' : 'Continue my application'}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => { clearResumeToken(slug); setView({ kind: 'start' }) }}
        className="self-start text-[13px] font-medium text-[#8A97B2] underline underline-offset-2 hover:text-[#5B6B8C]"
      >
        {fr ? 'Ce n’est pas toi ? Commencer une nouvelle candidature' : 'Not you? Start a new application'}
      </button>
    </div>
  )
}
