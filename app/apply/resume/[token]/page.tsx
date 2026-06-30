import { getApplicationDraft } from '@/actions/applications'
import { ApplicationForm } from '@/components/ApplicationForm'

// Reads the live draft (autosaved answers + submitted/expired state) via the
// cookie-less admin client — force dynamic so it is never served from cache.
export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  if (!draft) {
    return <main className="max-w-2xl mx-auto px-4 py-12"><p className="text-muted-foreground">This application link is not valid.</p></main>
  }
  if (draft.expired) {
    return <main className="max-w-2xl mx-auto px-4 py-12"><p className="text-muted-foreground">This application link has expired. Contact the organizer if you still need to complete your application.</p></main>
  }
  if (draft.submitted) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold mb-2">{draft.exchangeName}</h1>
        <p className="text-emerald-700">Your application has already been submitted. It can no longer be changed — the organizer will be in touch.</p>
      </main>
    )
  }
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold mb-1">{draft.exchangeName}</h1>
      <ApplicationForm token={token} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} />
    </main>
  )
}
