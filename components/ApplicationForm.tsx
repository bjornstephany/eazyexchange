'use client'
import { useState, useRef, useEffect } from 'react'
import { APPLICATION_SECTIONS, missingRequiredApplication, type AppField } from '@/lib/application-form'
import { saveApplicationDraft, submitApplication, uploadApplicationPhoto, sendApplicationResumeLink } from '@/actions/applications'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'
import { clearResumeToken } from '@/lib/apply-storage'

interface Props {
  token: string
  slug: string
  exchangeName: string
  initialData: Record<string, string>
  initialLanguage: 'en' | 'fr'
}

const T = {
  en: { intro: 'Fill out the form below — your answers are saved automatically as you go.', saved: 'SAVED ✓', saving: 'SAVING…', badge: 'Application', photo: 'Recent photo', submit: 'Submit my application', resend: 'Resend link', reassure: 'Progress saved automatically. We emailed you a link in case you switch devices.', submitting: 'Sending…', missing: 'Please complete all required fields.', unexpected: 'An unexpected error occurred.', done: 'Thank you! Your application has been submitted.', remind: "We've emailed you a link to continue your application anytime.", yes: 'Yes', no: 'No' },
  fr: { intro: 'Remplis le formulaire ci-dessous — tes réponses sont enregistrées automatiquement au fur et à mesure.', saved: 'ENREGISTRÉ ✓', saving: 'ENREGISTREMENT…', badge: 'Candidature', photo: 'Photo récente', submit: 'Envoyer ma candidature', resend: 'Renvoyer le lien', reassure: 'Progression enregistrée automatiquement. Nous t’avons envoyé un lien par e-mail au cas où tu changes d’appareil.', submitting: 'Envoi…', missing: 'Veuillez remplir tous les champs obligatoires.', unexpected: 'Une erreur est survenue.', done: 'Merci ! Ta candidature a été envoyée.', remind: 'Nous t’avons envoyé un e-mail avec un lien pour reprendre ta candidature.', yes: 'Oui', no: 'Non' },
}

export function ApplicationForm({ token, slug, exchangeName, initialData, initialLanguage }: Props) {
  const [lang, setLang] = useState<'en' | 'fr'>(initialLanguage)
  const [data, setData] = useState<Record<string, string>>(initialData)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [remindSent, setRemindSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = T[lang]

  function set(id: string, value: string) {
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
      setError(err instanceof Error ? err.message : t.unexpected)
    } finally { setReminding(false) }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.set('photo', file)
    try { await uploadApplicationPhoto(token, fd) } catch (err: unknown) { setError(err instanceof Error ? err.message : t.unexpected) }
  }

  async function onSubmit() {
    const missing = missingRequiredApplication(data)
    if (missing.length) { setError(t.missing); return }
    setSubmitting(true); setError(null)
    try { await submitApplication(token, data); clearResumeToken(slug); setDone(true) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : t.unexpected); setSubmitting(false) }
  }

  if (done) return <p className="py-16 text-center text-[15px] text-[#10203F]">{t.done}</p>

  function renderField(f: AppField) {
    if (f.type === 'textarea') {
      return <Textarea id={f.id} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} className="rounded-[10px] border-[#C4CDE0]" />
    }
    if (f.type === 'yesno') {
      return (
        <div className="flex gap-4 text-sm text-[#10203F]">
          {['yes', 'no'].map(v => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === v} onChange={() => set(f.id, v)} />
              {v === 'yes' ? t.yes : t.no}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'radio') {
      return (
        <div className="flex flex-col gap-1.5 text-sm text-[#10203F]">
          {f.options!.map(o => (
            <label key={o.value} className="flex items-center gap-1.5">
              <input type="radio" name={f.id} checked={data[f.id] === o.value} onChange={() => set(f.id, o.value)} />
              {o.label[lang]}
            </label>
          ))}
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return <Input id={f.id} type={inputType} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} className="h-[46px] rounded-[10px] border-[#C4CDE0]" />
  }

  const total = APPLICATION_SECTIONS.length
  return (
    <div className="pb-28">
      <header className="mb-[26px] flex items-center justify-between">
        <Logo href={null} />
        <div className="flex items-center gap-[18px]">
          <span className="font-mono text-[13px] font-medium text-[#8A97B2]">{saving ? t.saving : t.saved}</span>
          <div className="flex overflow-hidden rounded-[9px] border border-[#C4CDE0]">
            <button type="button" onClick={() => setLang('en')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'en' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>EN</button>
            <button type="button" onClick={() => setLang('fr')} className={`px-3.5 py-[7px] text-[13px] font-semibold ${lang === 'fr' ? 'bg-[#10203F] text-white' : 'text-[#5B6B8C]'}`}>FR</button>
          </div>
        </div>
      </header>

      <span className="mb-3 inline-flex rounded-full bg-[#E6ECFD] px-3 py-1 text-[13px] font-semibold text-[#1D48C7]">{t.badge}</span>
      <h1 className="m-0 mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{exchangeName}</h1>
      <p className="m-0 mb-7 text-base leading-relaxed text-[#5B6B8C]">{t.intro}</p>

      <div className="flex flex-col gap-6 rounded-t-[18px] border border-[#E4E9F2] bg-white px-9 py-[30px]">
        {APPLICATION_SECTIONS.map((section, i) => (
          <section key={section.id} className="flex flex-col gap-5">
            <div className="flex items-baseline gap-3 border-b border-[#E4E9F2] pb-3">
              <span className="font-mono text-xs font-semibold text-[#2456E6]">{i + 1}/{total}</span>
              <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-[#10203F]">{section.title[lang]}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.id === 'student' && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-[13.5px] font-semibold text-[#42506E]">{t.photo}</Label>
                  <input type="file" accept={ALLOWED_UPLOAD_ACCEPT} onChange={onPhoto} className="text-sm" />
                </div>
              )}
              {section.fields.map(f => (
                <div key={f.id} className={`flex flex-col gap-1.5 ${f.type === 'textarea' || f.type === 'radio' ? 'sm:col-span-2' : ''}`}>
                  <Label htmlFor={f.id} className="text-[13.5px] font-semibold text-[#42506E]">{f.label[lang]}{f.required && <span className="ml-1 text-[#C0392B]">*</span>}</Label>
                  {renderField(f)}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-[#C0392B]">{error}</p>}
      {remindSent && <p className="mt-4 text-sm text-[#0F7A3D]">{t.remind}</p>}
      <p className="mt-4 text-[13px] leading-relaxed text-[#8A97B2]">{t.reassure}</p>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#E4E9F2] bg-white">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-4 py-4">
          <button type="button" onClick={onResend} disabled={reminding || submitting} className="text-[13px] font-semibold text-[#5B6B8C] underline underline-offset-2 hover:text-[#10203F] disabled:opacity-50">{reminding ? '…' : t.resend}</button>
          <Button onClick={onSubmit} disabled={submitting || reminding} className="h-12 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">{submitting ? t.submitting : t.submit}</Button>
        </div>
      </div>
    </div>
  )
}
