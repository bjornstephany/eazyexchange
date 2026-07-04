import { getApplicationDraft } from '@/actions/applications'
import { ApplicationForm } from '@/components/ApplicationForm'

// Reads the live draft (autosaved answers + submitted/expired state) via the
// cookie-less admin client — force dynamic so it is never served from cache.
export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  if (!draft) return (
    <main className="mx-auto max-w-[720px] px-4 py-16"><p className="text-[15px] text-[#5B6B8C]">Ce lien de candidature n’est pas valide.</p></main>
  )
  if (draft.expired) return (
    <main className="mx-auto max-w-[720px] px-4 py-16"><p className="text-[15px] text-[#5B6B8C]">Ce lien de candidature a expiré. Contacte l’organisateur si tu dois encore compléter ta candidature.</p></main>
  )
  if (draft.submitted) return (
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
      <p className="text-[15px] text-[#0F7A3D]">Ta candidature a déjà été envoyée. Elle ne peut plus être modifiée — l’organisateur reviendra vers toi.</p>
    </main>
  )
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <ApplicationForm token={token} exchangeName={draft.exchangeName} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} />
    </main>
  )
}
