'use client'
import { useState, useRef, useEffect } from 'react'
import { APPLICATION_SECTIONS, missingRequiredApplication, type AppField } from '@/lib/application-form'
import { saveApplicationDraft, submitApplication, uploadApplicationPhoto } from '@/actions/applications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ALLOWED_UPLOAD_ACCEPT } from '@/lib/uploads'

interface Props {
  token: string
  initialData: Record<string, string>
  initialLanguage: 'en' | 'fr'
  locked: boolean
}

export function ApplicationForm({ token, initialData, initialLanguage, locked }: Props) {
  const [lang, setLang] = useState<'en' | 'fr'>(initialLanguage)
  const [data, setData] = useState<Record<string, string>>(initialData)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function set(id: string, value: string) {
    setData(prev => {
      const next = { ...prev, [id]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void autosave(next), 800)
      return next
    })
  }
  async function autosave(d: Record<string, string>) {
    if (locked) return
    setSaving(true)
    try { await saveApplicationDraft(token, d) } catch { /* transient; next edit retries */ } finally { setSaving(false) }
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData(); fd.set('photo', file)
    try { await uploadApplicationPhoto(token, fd) } catch (err: unknown) { setError(err instanceof Error ? err.message : 'An unexpected error occurred.') }
  }

  async function onSubmit() {
    const missing = missingRequiredApplication(data)
    if (missing.length) { setError(lang === 'fr' ? 'Veuillez remplir tous les champs obligatoires.' : 'Please complete all required fields.'); return }
    setSubmitting(true); setError(null)
    try { await submitApplication(token, data); setDone(true) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'An unexpected error occurred.'); setSubmitting(false) }
  }

  if (done) {
    return <p className="text-foreground">{lang === 'fr' ? 'Merci ! Votre candidature a été envoyée.' : 'Thank you! Your application has been submitted.'}</p>
  }

  function renderField(f: AppField) {
    if (f.type === 'textarea') {
      return <Textarea id={f.id} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} disabled={locked} />
    }
    if (f.type === 'yesno') {
      return (
        <div className="flex gap-4 text-sm">
          {['yes', 'no'].map(v => (
            <label key={v} className="flex items-center gap-1">
              <input type="radio" name={f.id} checked={data[f.id] === v} onChange={() => set(f.id, v)} disabled={locked} />
              {lang === 'fr' ? (v === 'yes' ? 'Oui' : 'Non') : (v === 'yes' ? 'Yes' : 'No')}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'radio') {
      return (
        <div className="flex flex-col gap-1 text-sm">
          {f.options!.map(o => (
            <label key={o.value} className="flex items-center gap-1">
              <input type="radio" name={f.id} checked={data[f.id] === o.value} onChange={() => set(f.id, o.value)} disabled={locked} />
              {o.label[lang]}
            </label>
          ))}
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'
    return <Input id={f.id} type={inputType} value={data[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} disabled={locked} />
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-sm">
          <button onClick={() => setLang('en')} className={lang === 'en' ? 'font-semibold underline' : 'text-muted-foreground'}>EN</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setLang('fr')} className={lang === 'fr' ? 'font-semibold underline' : 'text-muted-foreground'}>FR</button>
        </div>
        {saving && <span className="text-xs text-muted-foreground">{lang === 'fr' ? 'Enregistrement…' : 'Saving…'}</span>}
      </div>

      {APPLICATION_SECTIONS.map(section => (
        <section key={section.id} className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-1">{section.title[lang]}</h2>
          {section.id === 'student' && (
            <div className="space-y-1">
              <Label>{lang === 'fr' ? 'Photo récente' : 'Recent photo'}</Label>
              <input type="file" accept={ALLOWED_UPLOAD_ACCEPT} onChange={onPhoto} disabled={locked} />
            </div>
          )}
          {section.fields.map(f => (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={f.id}>{f.label[lang]}{f.required && <span className="text-red-500 ml-1">*</span>}</Label>
              {renderField(f)}
            </div>
          ))}
        </section>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!locked && (
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? '…' : (lang === 'fr' ? 'Envoyer ma candidature' : 'Submit my application')}
        </Button>
      )}
    </div>
  )
}
