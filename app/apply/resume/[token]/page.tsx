import { getApplicationDraft } from '@/actions/apply'
import { ApplicationForm } from '@/components/ApplicationForm'
import { ApplicationReadView } from '@/components/ApplicationReadView'
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
  if (draft.submitted) {
    const lang = draft.language === 'fr' ? 'fr' : 'en'
    const t = lang === 'fr'
      ? { sent: 'Candidature envoyée', on: 'le', note: 'Elle ne peut plus être modifiée — voici un récapitulatif de tes réponses. L’organisateur reviendra vers toi.' }
      : { sent: 'Application submitted', on: 'on', note: 'It can no longer be edited — here is a recap of your answers. The organizer will get back to you.' }
    const date = draft.submittedAt
      ? new Date(draft.submittedAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null
    return (
      <main className="mx-auto max-w-[720px] px-4 py-16">
        <h1 className="mb-2 font-display text-[30px] font-bold tracking-[-0.02em] text-[#10203F]">{draft.exchangeName}</h1>
        <p className="text-[15px] text-[#0F7A3D]">{t.sent}{date ? ` ${t.on} ${date}` : ''}. {t.note}</p>
        <div className="mt-8">
          <ApplicationReadView data={(draft.data ?? {}) as Record<string, string>} photoUrl={draft.photoUrl} lang={lang} />
        </div>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-[52px]">
      <ApplicationForm token={token} slug={draft.slug} exchangeName={draft.exchangeName} initialData={draft.data} initialLanguage={draft.language === 'fr' ? 'fr' : 'en'} initialPhotoUrl={draft.photoUrl} />
    </main>
  )
}
