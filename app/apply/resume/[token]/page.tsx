import { getApplicationDraft } from '@/actions/applications'
import { ApplicationForm } from '@/components/ApplicationForm'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  if (!draft) {
    return <main className="max-w-2xl mx-auto px-4 py-12"><p className="text-slate-600">This application link is not valid.</p></main>
  }
  const locked = draft.status !== 'draft'
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-1">{draft.exchangeName}</h1>
      {locked && <p className="text-sm text-emerald-700 mb-6">Your application has been submitted. It&apos;s now read-only.</p>}
      <ApplicationForm token={token} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} locked={locked} />
    </main>
  )
}
