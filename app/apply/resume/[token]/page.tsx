import { getApplicationDraft } from '@/actions/apply'
import { ApplicationForm } from '@/components/ApplicationForm'
import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'
import { InvalidLinkState } from '@/components/InvalidLinkState'

// Reads the live draft (autosaved answers + submitted/expired state) via the
// cookie-less admin client — force dynamic so it is never served from cache.
export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const draft = await getApplicationDraft(token)

  if (!draft) return (
    <InvalidLinkState
      title="Ce lien n’est plus valide"
      body="Il a peut-être expiré — c’est normal, les liens expirent pour protéger ton dossier. Vérifie l’adresse dans ton e-mail, ou demande à ton organisateur de t’en renvoyer un nouveau."
    />
  )
  if (draft.expired) return (
    <InvalidLinkState
      title="Ce lien a expiré"
      body="Les liens de candidature expirent au bout d’un moment pour protéger ton dossier. Demande à ton organisateur de t’en renvoyer un nouveau."
    />
  )
  if (draft.submitted) return (
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
      <p className="mb-6 text-[15px] text-[#0F7A3D]">Ta candidature a déjà été envoyée. Elle ne peut plus être modifiée — l’organisateur reviendra vers toi.</p>
      <div className="flex justify-start">
        <ApplicationRecapButton token={token} language={draft.language} />
      </div>
    </main>
  )
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <ApplicationForm token={token} slug={draft.slug} exchangeName={draft.exchangeName} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} initialPhotoUrl={draft.photoUrl} />
    </main>
  )
}
