'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveFormAnswers } from '@/actions/submissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FormField } from '@/types/db'

interface Props {
  assignmentId: string
  fields: FormField[]
  initialAnswers: Record<string, string>
  readOnly: boolean
}

export function DataEntryForm({ assignmentId, fields, initialAnswers, readOnly }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [loading, setLoading] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function setValue(fieldId: string, value: string) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  async function handleSave(submit: boolean) {
    setLoading(submit ? 'submit' : 'draft')
    setError(null)
    try {
      await saveFormAnswers(assignmentId, answers, submit)
      if (submit) router.push('/my-forms')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Échec de l’enregistrement')
    } finally {
      setLoading(null)
    }
  }

  const inputClass = 'h-11 focus-visible:border-brand'

  return (
    <div className="space-y-6">
      {!readOnly && (
        <p className="rounded-[10px] bg-hoverrow px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Tes réponses restent confidentielles — elles ne sont partagées qu’avec ta famille d’accueil si nécessaire.
        </p>
      )}

      {fields.map(field => (
        <div key={field.id} className="space-y-1.5">
          <Label htmlFor={field.id} className="text-[12px] font-semibold text-foreground">
            {field.label}
            {field.required && <span className="ml-1 text-danger-text">*</span>}
          </Label>
          {field.field_type === 'textarea' && (
            <Textarea
              id={field.id}
              value={answers[field.id] ?? ''}
              onChange={e => setValue(field.id, e.target.value)}
              disabled={readOnly}
              required={field.required}
              className="focus-visible:border-brand"
            />
          )}
          {(field.field_type === 'text' || field.field_type === 'date') && (
            <Input
              id={field.id}
              type={field.field_type === 'date' ? 'date' : 'text'}
              value={answers[field.id] ?? ''}
              onChange={e => setValue(field.id, e.target.value)}
              disabled={readOnly}
              required={field.required}
              className={inputClass}
            />
          )}
          {field.field_type === 'checkbox' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={answers[field.id] === 'true'}
                onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')}
                disabled={readOnly}
                className="h-4 w-4 rounded border-border"
              />
              {field.label}
            </label>
          )}
          {field.field_type === 'select' && field.options && (
            <Select
              value={answers[field.id] ?? ''}
              onValueChange={v => setValue(field.id, v)}
              disabled={readOnly}
            >
              <SelectTrigger id={field.id}>
                <SelectValue placeholder="Choisis une option" />
              </SelectTrigger>
              <SelectContent>
                {field.options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-danger-text">{error}</p>}

      {!readOnly && (
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={loading !== null}>
            {loading === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={loading !== null} className="bg-brand hover:bg-brand-hover">
            {loading === 'submit' ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      )}
    </div>
  )
}
