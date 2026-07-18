import { redirect } from 'next/navigation'

// Doc templates are edited under /forms/[templateId] since the Fichiers merge.
export default async function EditDocumentPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  redirect(`/forms/${templateId}`)
}
