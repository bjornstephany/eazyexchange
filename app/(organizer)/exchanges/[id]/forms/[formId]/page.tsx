import { getTemplate } from '@/actions/forms'
import { FormBuilder } from '@/components/FormBuilder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { notFound } from 'next/navigation'

export default async function FormTemplatePage({ params }: { params: { id: string; formId: string } }) {
  let template
  try { template = await getTemplate(params.formId) }
  catch { notFound() }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold">{template.name}</h1>
        <Badge>{template.type === 'data_entry' ? 'Data entry' : 'Document upload'}</Badge>
        <span className="text-sm text-muted-foreground">Deadline: {template.deadline}</span>
      </div>
      <Card>
        <CardContent className="pt-6">
          <FormBuilder
            templateId={template.id}
            type={template.type}
            fields={(template as any).form_fields ?? []}
            slots={(template as any).document_slots ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
