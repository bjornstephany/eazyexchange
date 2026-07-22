import { redirect, notFound } from 'next/navigation'
import { getTemplate } from '@/actions/forms'

// Phase 3: template editing moved to the session-scoped /forms/[templateId].
export default async function LegacyFormTemplatePage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params
  try {
    await getTemplate(formId)
  } catch {
    notFound()
  }
  redirect(`/forms/${formId}`)
}
