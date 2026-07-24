'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { missingRequiredApplication, overLimitApplicationFields, invalidFormatApplicationFields, parentGroupFields } from '@/lib/application-form'
import { localizedApplicationSections, type LocalizedField } from '@/lib/application-form.labels'
import { asAppTranslator } from '@/lib/i18n/messages'
import { useTranslations } from 'next-intl'
import { saveApplicationDraft, submitApplication, sendApplicationResumeLink, setApplicationLanguage } from '@/actions/apply'
import { ApplicationPhotoUpload } from '@/components/ApplicationPhotoUpload'
import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { writeLocaleCookie } from '@/lib/i18n/cookie'
import type { Locale } from '@/lib/i18n/config'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { clearResumeToken } from '@/lib/apply-storage'

interface Props {
  token: string
  slug: string
  exchangeName: string
  initialData: Record<string, string>
  locale: Locale
  initialPhotoUrl: string | null
}

const PARENT_FIELD_IDS = [...parentGroupFields('father'), ...parentGroupFields('mother')].map(f => f.id)

export function ApplicationForm({ token, slug, exchangeName, initialData, locale, initialPhotoUrl }: Props) {
  const [data, setData] = useState<Record<string, string>>(initialData)
  const [hasPhoto, setHasPhoto] = useState(initialPhotoUrl != null)
  const [missing, setMissing] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [remindSent, setRemindSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const t = useTranslations('apply')
  // Field labels come from the `apply` catalog (one source for the funnel form,
  // the organizer read view and the PDF recap).
  const sections = localizedApplicationSections(asAppTranslator(t))

  function set(id: string, value: string) {
    setMissing(prev => (prev.includes(id) ? prev.filter(m => m !== id) : prev))
    setData(prev => {
      const next = { ...prev, [id]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void autosave(next), 800)
      return next
    })
  }
  async function autosave(d: Record<string, string>) {
    setSaving(true)
    try { await saveApplicationDraft(token, d) } catch { /* transient; next edit retries */ } finally { setSaving(false) }
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function onResend() {
    setReminding(true); setError(null)
    try {
      await saveApplicationDraft(token, data)
      await sendApplicationResumeLink(token)
      setRemindSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('form.unexpected'))
    } finally { setReminding(false) }
  }

  async function onSubmit() {
    const miss = missingRequiredApplication(data, { hasPhoto })
    const over = overLimitApplicationFields(data)
    const badFormat = invalidFormatApplicationFields(data)
    const flagged = [...miss, ...over, ...badFormat]
    setMissing(flagged)
    if (flagged.length) {
      setError(miss.length ? t('form.missing') : over.length ? t('form.tooLong') : t('form.badFormat'))
      document.getElementById(`field-${flagged[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true); setError(null)
    try {
      const res = await submitApplication(token, data)
      if (!res.ok) {
        if ('registered' in res) {
          setError(t('form.registered'))
          setSubmitting(false)
          return
        }
        // The server re-runs the same gates; only the two it can disagree with
        // the client on come back structured (a stale tab, or a payload that
        // never went through the form).
        const flaggedByServer = 'overLimit' in res ? res.overLimit : res.invalidFormat
        setMissing(flaggedByServer)
        setError('overLimit' in res ? t('form.tooLong') : t('form.badFormat'))
        document.getElementById(`field-${flaggedByServer[0]}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        setSubmitting(false)
        return
      }
      clearResumeToken(slug); setDone(true)
    }
    catch (err: unknown) { setError(err instanceof Error ? err.message : t('form.unexpected')); setSubmitting(false) }
  }

  if (done) return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <p className="m-0 text-[15px] text-[#10203F]">{t('form.done')}</p>
      <ApplicationRecapButton token={token} language={locale} />
    </div>
  )

  function renderField(f: LocalizedField) {
    const invalid = missing.includes(f.id)
    const inputBorder = invalid ? 'border-[#C0392B]' : 'border-[#C4CDE0]'
    if (f.type === 'textarea') {
      const len = (data[f.id] ?? '').length
      return (
        <>
          <Textarea id={f.id} value={data[f.id] ?? ''} maxLength={f.maxLength} aria-invalid={invalid || undefined} onChange={e => set(f.id, e.target.value)} className={`rounded-[10px] ${inputBorder}`} />
          {f.maxLength != null && (
            <span className={`self-end font-mono text-[11px] ${len > f.maxLength ? 'font-semibold text-[#C0392B]' : 'text-[#8A97B2]'}`}>
              {len}/{f.maxLength}
            </span>
          )}
        </>
      )
    }
    if (f.type === 'yesno') {
      return (
        <div className={`flex gap-4 text-sm text-[#10203F] ${invalid ? 'rounded-[10px] border border-[#C0392B] p-2' : ''}`}>
          {['yes', 'no'].map(v => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === v} onChange={() => set(f.id, v)} />
              {v === 'yes' ? t('form.yes') : t('form.no')}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'radio') {
      return (
        <div className={`flex flex-col gap-1.5 text-sm text-[#10203F] ${invalid ? 'rounded-[10px] border border-[#C0392B] p-2' : ''}`}>
          {f.options!.map(o => (
            <label key={o.value} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === o.value} onChange={() => set(f.id, o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return <Input id={f.id} type={inputType} value={data[f.id] ?? ''} aria-invalid={invalid || undefined} onChange={e => set(f.id, e.target.value)} className={`h-[46px] rounded-[10px] ${inputBorder}`} />
  }

  const showSeparation = data.family_status === 'separated' || data.family_status === 'step_family'
  const showGenderOther = data.sex === 'other'
  const parentsInvalid = missing.some(id => PARENT_FIELD_IDS.includes(id))
  const total = sections.length
  return (
    <div className="pb-28">
      <header className="mb-[26px] flex items-center justify-between">
        <Logo href={null} />
        <div className="flex items-center gap-[18px]">
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">{saving ? t('form.saving') : t('form.saved')}</span>
          <LanguageSwitcher
            current={locale}
            ariaLabel={t('form.languageLabel')}
            onSelect={async (next) => { await setApplicationLanguage(token, next); writeLocaleCookie(next); router.refresh() }}
          />
        </div>
      </header>

      <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{t('form.badge')}</span>
      <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchangeName}</h1>
      <p className="m-0 mb-1 text-base leading-relaxed text-[#5B6B8C]">{t('form.intro')}</p>
      <p className="m-0 mb-7 text-[13px] leading-relaxed text-[#8A97B2]">{t('form.noneHint')}</p>

      <div className="flex flex-col gap-6 rounded-t-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        {sections.map((section, i) => (
          <section key={section.id} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 border-b border-[#E4E9F2] pb-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold text-[#2456E6]">{i + 1}/{total}</span>
                <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-[#10203F]">{section.title}</span>
              </div>
              {section.id === 'parents' && (
                <p className={`m-0 text-[13px] ${parentsInvalid ? 'font-semibold text-[#C0392B]' : 'text-[#8A97B2]'}`}>{t('form.parentHelper')}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.id === 'student' && (
                <div className="sm:col-span-2">
                  <ApplicationPhotoUpload
                    token={token}
                    initialPhotoUrl={initialPhotoUrl}
                    invalid={missing.includes('photo')}
                    onUploaded={() => { setHasPhoto(true); setMissing(prev => prev.filter(id => id !== 'photo')) }}
                  />
                </div>
              )}
              {section.fields.map(f => {
                if (f.id === 'separation_housing_address' && !showSeparation) return null
                if (f.id === 'gender_other' && !showGenderOther) return null
                return (
                  <div key={f.id} id={`field-${f.id}`} className={`flex flex-col gap-1.5 ${f.type === 'textarea' || f.type === 'radio' ? 'sm:col-span-2' : ''}`}>
                    <Label htmlFor={f.id} className="text-[13.5px] font-semibold text-[#42506E]">
                      {f.label}
                      {(f.required || f.id === 'separation_housing_address' || f.id === 'gender_other') && <span className="ml-1 text-[#C0392B]">*</span>}
                    </Label>
                    {renderField(f)}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[#C0392B]">{error}</p>}
      {remindSent && <p className="mt-4 text-sm text-[#0F7A3D]">{t('form.remind')}</p>}
      <p className="mt-4 text-[13px] leading-relaxed text-[#8A97B2]">{t('form.reassure')}</p>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#E4E9F2] bg-white">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-4">
          <button type="button" onClick={onResend} disabled={reminding || submitting} className="text-[13px] font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F] disabled:opacity-50">{reminding ? '…' : t('form.resend')}</button>
          <Button onClick={onSubmit} disabled={submitting || reminding} className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">{submitting ? t('form.submitting') : t('form.submit')}</Button>
        </div>
      </div>
    </div>
  )
}
