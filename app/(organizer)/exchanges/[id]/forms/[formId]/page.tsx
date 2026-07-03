import { redirect, notFound } from 'next/navigation'
import { getTemplate } from '@/actions/forms'

// Phase 3: form/document editing moved to the session-scoped
// /forms/[templateId] and /documents/[templateId] pages.
export default async function LegacyFormTemplatePage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params
  let template
  try {
    template = await getTemplate(formId)
  } catch {
    notFound()
  }
  redirect(template.kind === 'doc' ? `/documents/${formId}` : `/forms/${formId}`)
}
