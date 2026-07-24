'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeOnboarding, completeFirstExchange } from '@/actions/onboarding'
import { inviteOrganizer } from '@/actions/settings'
import {
  ONBOARDING_CARD_PROMPTS, EMPTY_FIRST_EXCHANGE_DETAILS,
  type FirstExchangeCard, type FirstExchangeDetails,
} from '@/lib/onboarding/first-exchange'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SchoolCombobox } from './SchoolCombobox'
import type { SchoolOption } from '@/lib/schools/registry'

// The five locales the app ships in, plus an escape hatch so a legitimate
// Canadian or American organizer is not turned away. 'FR' is the only value
// that unlocks the registry picker.
const COUNTRIES: { value: string; label: string }[] = [
  { value: 'FR', label: 'France' },
  { value: 'Allemagne', label: 'Allemagne' },
  { value: 'Espagne', label: 'Espagne' },
  { value: 'Italie', label: 'Italie' },
  { value: 'Royaume-Uni', label: 'Royaume-Uni' },
  { value: 'other', label: 'Autre pays' },
]

export function OnboardingForm({
  initialStep = 1, initialSchoolName = '',
}: { initialStep?: 1 | 2; initialSchoolName?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 1: which establishment this school IS. The claimed name is not kept in
  // its own state — step 1 renders the picker, and step 2 reads it from
  // details.sending_school_name.
  const [country, setCountry] = useState('FR')
  const [otherCountry, setOtherCountry] = useState('')
  const [school, setSchool] = useState<SchoolOption | null>(null)
  const [foreignName, setForeignName] = useState('')

  // Step 2: exchange + structured details + guided info cards
  const [exchangeName, setExchangeName] = useState('')
  const [details, setDetails] = useState<FirstExchangeDetails>({
    ...EMPTY_FIRST_EXCHANGE_DETAILS,
    sending_school_name: initialSchoolName,
  })
  const [cards, setCards] = useState<FirstExchangeCard[]>(
    ONBOARDING_CARD_PROMPTS.map(title => ({ title, body: '' })),
  )
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [exchangeBusy, setExchangeBusy] = useState(false)

  // Step 3: invite state
  const [email, setEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [sent, setSent] = useState<string[]>([])

  function setCard(i: number, patch: Partial<FirstExchangeCard>) {
    setCards(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  function setDetail(key: keyof FirstExchangeDetails, value: string) {
    setDetails(prev => ({ ...prev, [key]: value }))
  }

  const resolvedCountry = country === 'other' ? otherCountry.trim() : country
  const canSubmitStep1 = country === 'FR'
    ? school !== null
    : resolvedCountry !== '' && foreignName.trim() !== ''

  async function handleName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await completeOnboarding({
        country: resolvedCountry,
        uai: country === 'FR' ? school?.uai ?? null : null,
        // For FR, send the picked row's name so a shared UAI resolves to the
        // exact campus shown in the picker (re-validated server-side).
        name: country === 'FR' ? school?.name ?? '' : foreignName.trim(),
      })
      if (!result.ok) { setError(result.message); return }
      setDetails(prev => ({
        ...prev,
        sending_school_name: prev.sending_school_name || result.schoolName,
      }))
      setStep(2)
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  async function handleExchange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setExchangeBusy(true)
    setExchangeError(null)
    try {
      const result = await completeFirstExchange(exchangeName, details, cards)
      if (result.ok) { setStep(3); return }
      setExchangeError(result.message)
    } catch {
      setExchangeError('Une erreur est survenue. Réessayez.')
    } finally {
      setExchangeBusy(false)
    }
  }

  async function handleInvite() {
    setInviteBusy(true); setInviteError(null)
    try {
      await inviteOrganizer(email)
      setSent(prev => [...prev, email.trim()])
      setEmail('')
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
    setInviteBusy(false)
  }

  if (step === 1) {
    return (
      <form onSubmit={handleName} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="country" className="text-[13px] font-semibold text-[#42506E]">Pays</Label>
          <select
            id="country"
            value={country}
            onChange={e => { setCountry(e.target.value); setSchool(null); setError(null) }}
            className="h-11 rounded-[10px] border border-[#C4CDE0] bg-white px-3 text-[14px] text-[#10203F] focus:border-[#2456E6] focus:outline-none"
          >
            {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {country === 'other' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other-country" className="text-[13px] font-semibold text-[#42506E]">Précisez le pays</Label>
            <Input
              id="other-country" required value={otherCountry}
              onChange={e => setOtherCountry(e.target.value)}
              className="h-11 rounded-[10px] border-[#C4CDE0]"
            />
          </div>
        )}

        {country === 'FR' ? (
          <SchoolCombobox value={school} onSelect={setSchool} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="foreign-school" className="text-[13px] font-semibold text-[#42506E]">Nom de l’établissement</Label>
            <Input
              id="foreign-school" required value={foreignName}
              onChange={e => setForeignName(e.target.value)}
              className="h-11 rounded-[10px] border-[#C4CDE0]"
            />
            <p className="m-0 text-[12.5px] text-[#8A97B1]">
              Hors de France, nous vérifions votre établissement manuellement.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-[#C0392B]">{error}</p>}
        <Button
          type="submit" disabled={loading || !canSubmitStep1}
          className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7] disabled:opacity-50"
        >
          {loading ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }

  if (step === 2) {
    return (
      <form onSubmit={handleExchange} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="m-0 font-display text-[17px] font-bold text-[#10203F]">Votre premier programme</h4>
          <p className="m-0 text-[14px] leading-relaxed text-[#5B6B8C]">
            Renseignez les informations clés — vos élèves les verront dès leur connexion.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exchange-name" className="text-[13px] font-semibold text-[#42506E]">Nom du programme</Label>
          <Input
            id="exchange-name"
            value={exchangeName}
            onChange={e => setExchangeName(e.target.value)}
            placeholder="Échange Espagne 2026"
            required
            className="h-11 rounded-[10px] border-[#C4CDE0]"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="pd-destination" className="text-[13px] font-semibold text-[#42506E]">Destination</Label>
            <Input id="pd-destination" required value={details.destination}
              onChange={e => setDetail('destination', e.target.value)}
              placeholder="le Minnesota, USA"
              className="h-11 rounded-[10px] border-[#C4CDE0]" />
            <p className="m-0 text-[12px] text-[#8A97B1]">Telle qu’elle apparaîtra dans les formulaires.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pd-travel-start" className="text-[13px] font-semibold text-[#42506E]">Date de départ</Label>
            <Input id="pd-travel-start" type="date" required value={details.travel_start}
              onChange={e => setDetail('travel_start', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pd-travel-end" className="text-[13px] font-semibold text-[#42506E]">Date de retour</Label>
            <Input id="pd-travel-end" type="date" required value={details.travel_end}
              onChange={e => setDetail('travel_end', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
          </div>
        </div>

        <details className="rounded-[10px] border border-[#E1E7F0] p-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-[#42506E]">
            Informations complémentaires (facultatif)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-chaperones" className="text-[13px] font-semibold text-[#42506E]">Accompagnateurs</Label>
              <Textarea id="pd-chaperones" rows={2} value={details.chaperones}
                onChange={e => setDetail('chaperones', e.target.value)}
                placeholder="Un nom complet par ligne" className="rounded-[8px] border-[#C4CDE0] text-[14px]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-association" className="text-[13px] font-semibold text-[#42506E]">Nom de l’association</Label>
              <Input id="pd-association" value={details.association_name}
                onChange={e => setDetail('association_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-sending-school" className="text-[13px] font-semibold text-[#42506E]">Lycée d’origine</Label>
              <Input id="pd-sending-school" value={details.sending_school_name}
                onChange={e => setDetail('sending_school_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-receiving-school" className="text-[13px] font-semibold text-[#42506E]">Établissement d’accueil</Label>
              <Input id="pd-receiving-school" value={details.receiving_school_name}
                onChange={e => setDetail('receiving_school_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-proviseur" className="text-[13px] font-semibold text-[#42506E]">Nom du proviseur</Label>
              <Input id="pd-proviseur" value={details.proviseur_name}
                onChange={e => setDetail('proviseur_name', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pd-sending-city" className="text-[13px] font-semibold text-[#42506E]">Ville du lycée</Label>
              <Input id="pd-sending-city" value={details.sending_city}
                onChange={e => setDetail('sending_city', e.target.value)} className="h-11 rounded-[10px] border-[#C4CDE0]" />
            </div>
          </div>
        </details>

        <div className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-[#E1E7F0] p-3">
              <Input
                aria-label={`Titre ${i + 1}`}
                value={card.title}
                onChange={e => setCard(i, { title: e.target.value })}
                maxLength={120}
                className="h-9 rounded-[8px] border-[#C4CDE0] text-[13.5px] font-semibold"
              />
              <Textarea
                aria-label={`${card.title} — détails`}
                value={card.body}
                onChange={e => setCard(i, { body: e.target.value })}
                maxLength={2000}
                rows={2}
                placeholder="Ajoutez les détails (facultatif pour cette carte)…"
                className="rounded-[8px] border-[#C4CDE0] text-[14px]"
              />
            </div>
          ))}
          <p className="m-0 text-[12.5px] text-[#8A97B1]">Ces informations sont facultatives — vos élèves les verront dans l’onglet Infos.</p>
        </div>
        {exchangeError && <p className="text-sm text-[#C0392B]">{exchangeError}</p>}
        <Button type="submit" disabled={exchangeBusy} className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7]">
          {exchangeBusy ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h4 className="m-0 font-display text-[17px] font-bold text-[#10203F]">Invitez vos collègues (optionnel)</h4>
        <p className="m-0 text-[14px] leading-relaxed text-[#5B6B8C]">
          Ils pourront co-gérer vos échanges. Vous pourrez aussi les inviter plus tard depuis les Réglages.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleInvite() } }}
          placeholder="adresse@etablissement.fr"
          className="h-11 rounded-[10px] border-[#C4CDE0]"
        />
        <Button type="button" onClick={handleInvite} disabled={inviteBusy} className="h-11 flex-none rounded-[11px] bg-[#2456E6] px-5 text-base font-semibold hover:bg-[#1D48C7]">
          Inviter
        </Button>
      </div>
      {inviteError && <p className="text-sm text-[#C0392B]">{inviteError}</p>}
      {sent.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {sent.map(e => (
            <li key={e} className="rounded-[9px] bg-[#EEF1F7] px-3 py-2 text-[13.5px] text-[#42506E]">
              ✓ Invitation envoyée à <span>{e}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex justify-between">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')} className="text-[#5B6B8C]">
          Passer
        </Button>
        <Button type="button" onClick={() => router.push('/dashboard')} className="h-11 rounded-[11px] bg-[#2456E6] px-6 text-base font-semibold hover:bg-[#1D48C7]">
          Continuer
        </Button>
      </div>
    </div>
  )
}
