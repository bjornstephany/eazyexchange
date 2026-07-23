'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { startApplication } from '@/actions/apply'
import { storeResumeToken } from '@/lib/apply-storage'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { writeLocaleCookie } from '@/lib/i18n/cookie'
import type { Locale } from '@/lib/i18n/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ApplicationStartForm({ slug, locale }: { slug: string; locale: Locale }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<'draft' | 'submitted' | 'closed' | 'registered' | null>(null)
  const t = useTranslations('apply')
  const router = useRouter()

  async function start() {
    setLoading(true); setError(null); setNotice(null)
    try {
      const res = await startApplication(slug, { ...form, language: locale })
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
      if ('invalidEmail' in res) {
        setError(t('start.invalidEmail'))
        setLoading(false)
        return
      }
      if ('registered' in res) {
        setNotice('registered')
        setLoading(false)
        return
      }
      setNotice(res.existing)
      setLoading(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('start.genericError')); setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <LanguageSwitcher
          current={locale}
          ariaLabel={t('start.languageLabel')}
          onSelect={(next) => { writeLocaleCookie(next); router.refresh() }}
        />
      </div>
      <p className="m-0 text-base leading-relaxed text-[#5B6B8C]">{t('start.intro')}</p>
      <div className="flex flex-col gap-4 rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first_name" className="text-[13.5px] font-semibold text-[#42506E]">{t('start.firstName')}</Label>
            <Input id="first_name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last_name" className="text-[13.5px] font-semibold text-[#42506E]">{t('start.lastName')}</Label>
            <Input id="last_name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-[13.5px] font-semibold text-[#42506E]">{t('start.email')}</Label>
          <Input id="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
          <p className="m-0 text-xs text-[#8A97B2]">{t('start.emailHint')}</p>
        </div>
        {notice && (
          <div className="rounded-[10px] bg-[#E6ECFD] px-4 py-3 text-sm leading-relaxed text-[#1D48C7]">
            <p className="m-0">{t(`start.notices.${notice}`)}</p>
            {notice === 'registered' && (
              <a href="/login" className="mt-1 inline-block font-semibold underline">{t('start.login')}</a>
            )}
          </div>
        )}
        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button onClick={start} disabled={loading || !form.email || !form.first_name || !form.last_name} className="h-12 self-start rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          {loading ? '…' : t('start.submit')}
        </Button>
      </div>
    </div>
  )
}
