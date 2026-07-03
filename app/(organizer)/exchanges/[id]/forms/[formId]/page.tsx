import { redirect } from 'next/navigation'
import { getTemplate } from '@/actions/forms'

// Phase 3: form/document editing moved to the session-scoped
// /forms/[templateId] and /documents/[templateId] pages.
export default async function LegacyFormTemplatePage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params
  const template = await getTemplate(formId)
  redirect(template.kind === 'doc' ? `/documents/${formId}` : `/forms/${formId}`)
}
