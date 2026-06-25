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
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {fields.map(field => (
        <div key={field.id} className="space-y-1">
          <Label htmlFor={field.id}>
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {field.field_type === 'textarea' && (
            <Textarea
              id={field.id}
              value={answers[field.id] ?? ''}
              onChange={e => setValue(field.id, e.target.value)}
              disabled={readOnly}
              required={field.required}
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
            />
          )}
          {field.field_type === 'checkbox' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={answers[field.id] === 'true'}
                onChange={e => setValue(field.id, e.target.checked ? 'true' : 'false')}
                disabled={readOnly}
                className="h-4 w-4 rounded border-slate-300"
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
                <SelectValue placeholder="Select an option" />
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!readOnly && (
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={loading !== null}>
            {loading === 'draft' ? 'Saving…' : 'Save draft'}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={loading !== null}>
            {loading === 'submit' ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      )}
    </div>
  )
}
