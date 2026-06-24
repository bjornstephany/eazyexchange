'use client'
import { createTemplate } from '@/actions/forms'
import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewFormPage() {
  const { id: exchangeId } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('exchange_id', exchangeId)
      const templateId = await createTemplate(fd)
      router.push(`/exchanges/${exchangeId}/forms/${templateId}`)
    } catch (err: any) {
      setError(err.message); setLoading(false)
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader><CardTitle>New form template</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Form name</Label>
            <Input id="name" name="name" placeholder="Medical information" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="type">Type</Label>
            <Select name="type" defaultValue="data_entry" required>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="data_entry">Data entry form</SelectItem>
                <SelectItem value="document_upload">Document upload</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" name="deadline" type="date" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create & add fields'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
