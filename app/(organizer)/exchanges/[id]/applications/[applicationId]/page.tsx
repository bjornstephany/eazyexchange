import { redirect } from 'next/navigation'
export default async function LegacyApplicationPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params
  redirect(`/applications?id=${applicationId}`)
}
