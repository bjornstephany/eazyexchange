'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startApplication } from '@/actions/applications'
import { storeResumeToken } from '@/lib/apply-storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const NOTICE = {
  draft: {
    en: 'An application is already in progress with this email address — we’ve re-sent you the link by email so you can continue.',
    fr: 'Une candidature est déjà en cours avec cette adresse — nous t’avons renvoyé le lien pour continuer par e-mail.',
  },
  submitted: {
    en: 'An application has already been submitted with this email address.',
    fr: 'Une candidature a déjà été envoyée avec cette adresse e-mail.',
  },
  closed: {
    en: 'Applications are closed for this exchange.',
    fr: 'Les candidatures sont fermées pour cet échange.',
  },
} as const

export function ApplicationStartForm({ slug }: { slug: string }) {
  const [lang, setLang] = useState<'en' | 'fr'>('en')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<'draft' | 'submitted' | 'closed' | null>(null)
  const router = useRouter()
  const fr = lang === 'fr'

  async function start() {
    setLoading(true); setError(null); setNotice(null)
    try {
      const res = await startApplication(slug, { ...form, language: lang })
      if ('token' in res) {
        storeResumeToken(slug, res.token)
        router.push(`/apply/resume/${res.token}`)
        return
      }
      if ('closed' in res) {
        setNotice('closed')
        setLoading(false)
        return
      }
      setNotice(res.existing)
      setLoading(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : (fr ? 'Une erreur est survenue.' : 'Something went wrong')); setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <div className="flex overflow-hidden rounded-[9px] border border-[#C4CDE0]">
          <button type="button" onClick={() => setLang('en')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'en' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>EN</button>
          <button type="button" onClick={() => setLang('fr')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'fr' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>FR</button>
        </div>
      </div>
      <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">{fr ? 'Candidate à cet échange scolaire. Commence par renseigner tes informations ci-dessous.' : 'Apply to join this student exchange. Start by entering your details below.'}</p>
      <div className="flex flex-col gap-4 rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first_name" className="text-[13.5px] font-semibold text-[#42506E]">{fr ? 'Prénom' : 'First name'}</Label>
            <Input id="first_name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last_name" className="text-[13.5px] font-semibold text-[#42506E]">{fr ? 'Nom' : 'Last name'}</Label>
            <Input id="last_name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13.5px] font-semibold text-[#42506E]">E-mail</Label>
          <Input id="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          <p className="m-0 text-xs text-[#8A97B2]">{fr ? 'Tu peux compléter ta candidature maintenant — nous t’enverrons aussi un lien privé par e-mail pour la reprendre sur n’importe quel appareil.' : 'You can complete your application now — we’ll also email you a private link so you can pick up where you left off on any device.'}</p>
        </div>
        {notice && <p className="m-0 rounded-[10px] bg-[#E6ECFD] px-4 py-3 text-sm leading-relaxed text-[#1D48C7]">{NOTICE[notice][lang]}</p>}
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button onClick={start} disabled={loading || !form.email || !form.first_name || !form.last_name} className="h-12 self-start rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? '…' : (fr ? 'Commencer ma candidature' : 'Start my application')}
        </Button>
      </div>
    </div>
  )
}
