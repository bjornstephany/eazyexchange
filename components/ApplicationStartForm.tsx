'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startApplication } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ApplicationStartForm({ slug }: { slug: string }) {
  const [lang, setLang] = useState<'en' | 'fr'>('en')
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function start() {
    setLoading(true); setError(null)
    try {
      const { token } = await startApplication(slug, { ...form, language: lang })
      router.push(`/apply/resume/${token}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong'); setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1 text-sm">
        <button onClick={() => setLang('en')} className={lang === 'en' ? 'font-semibold underline' : 'text-slate-500'}>EN</button>
        <span className="text-slate-300">/</span>
        <button onClick={() => setLang('fr')} className={lang === 'fr' ? 'font-semibold underline' : 'text-slate-500'}>FR</button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="first_name">{lang === 'fr' ? 'Prénom' : 'First name'}</Label>
        <Input id="first_name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="last_name">{lang === 'fr' ? 'Nom' : 'Last name'}</Label>
        <Input id="last_name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <p className="text-xs text-slate-400">{lang === 'fr' ? 'Nous vous enverrons un lien privé pour reprendre votre candidature à tout moment.' : "We'll email you a private link to resume your application anytime."}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={start} disabled={loading || !form.email || !form.first_name || !form.last_name}>
        {loading ? '…' : (lang === 'fr' ? 'Commencer ma candidature' : 'Start my application')}
      </Button>
    </div>
  )
}
