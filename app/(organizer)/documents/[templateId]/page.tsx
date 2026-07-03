import { redirect } from 'next/navigation'
import { getTemplate } from '@/actions/forms'
import { TemplateEditor } from '@/components/forms/TemplateEditor'

export default async function EditDocumentPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const template = await getTemplate(templateId)
  if (template.kind !== 'doc') redirect(`/forms/${templateId}`)
  return <TemplateEditor template={template} backHref="/documents" backLabel="Retour aux documents" />
}
