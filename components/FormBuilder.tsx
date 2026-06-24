'use client'
import { useState } from 'react'
import { addField, addSlot, removeField, removeSlot } from '@/actions/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FormField, DocumentSlot, FieldType } from '@/types/db'

interface Props {
  templateId: string
  type: 'data_entry' | 'document_upload'
  fields: FormField[]
  slots: DocumentSlot[]
}

export function FormBuilder({ templateId, type, fields, slots }: Props) {
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [description, setDescription] = useState('')
  const [required, setRequired] = useState(true)
  const [loading, setLoading] = useState(false)

  async function handleAddField() {
    if (!label.trim()) return
    setLoading(true)
    await addField(templateId, label, fieldType, required)
    setLabel(''); setLoading(false)
  }

  async function handleAddSlot() {
    if (!label.trim()) return
    setLoading(true)
    await addSlot(templateId, label, description || null, required)
    setLabel(''); setDescription(''); setLoading(false)
  }

  return (
    <div className="space-y-6">
      {type === 'data_entry' && (
        <div>
          <h3 className="font-medium mb-3">Fields ({fields.length})</h3>
          <ul className="space-y-2 mb-4">
            {fields.map(f => (
              <li key={f.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-sm">
                <span>{f.label} <span className="text-slate-400">({f.field_type}){f.required ? ' *' : ''}</span></span>
                <button onClick={() => removeField(f.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label>Label</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Emergency contact name" />
            </div>
            <div className="w-32 space-y-1">
              <Label>Type</Label>
              <Select value={fieldType} onValueChange={v => setFieldType(v as FieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['text','textarea','date','checkbox','select'] as FieldType[]).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddField} disabled={loading}>Add field</Button>
          </div>
        </div>
      )}

      {type === 'document_upload' && (
        <div>
          <h3 className="font-medium mb-3">Document slots ({slots.length})</h3>
          <ul className="space-y-2 mb-4">
            {slots.map(s => (
              <li key={s.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-sm">
                <span>{s.label}{s.required ? ' *' : ''}</span>
                <button onClick={() => removeSlot(s.id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label>Slot name</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Passport copy" />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Description (optional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Clear scan of photo page" />
            </div>
            <Button onClick={handleAddSlot} disabled={loading}>Add slot</Button>
          </div>
        </div>
      )}
    </div>
  )
}
