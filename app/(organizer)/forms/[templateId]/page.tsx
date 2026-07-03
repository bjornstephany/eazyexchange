import { redirect } from 'next/navigation'
import { getTemplate } from '@/actions/forms'
import { TemplateEditor } from '@/components/forms/TemplateEditor'

export default async function EditFormPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const template = await getTemplate(templateId)
  if (template.kind === 'doc') redirect(`/documents/${templateId}`)
  return <TemplateEditor template={template} backHref="/forms" backLabel="Retour aux formulaires" />
}
