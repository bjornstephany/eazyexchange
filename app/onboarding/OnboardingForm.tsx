'use client'
import { useState, useEffect } from 'react'
import { completeOnboarding, completeFirstExchange } from '@/actions/onboarding'
import {
  EMPTY_FIRST_EXCHANGE_DETAILS, type FirstExchangeDetails,
} from '@/lib/onboarding/first-exchange'
import { travelOrderProblem } from '@/lib/exchange/travel-dates'
import { loadDraft, saveDraft, clearDraft } from '@/lib/onboarding/draft'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  schoolId, initialStep = 1,
}: { schoolId: string; initialStep?: 1 | 2 }) {
  const [step, setStep] = useState<1 | 2>(initialStep)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 1: which establishment this school IS.
  const [country, setCountry] = useState('FR')
  const [otherCountry, setOtherCountry] = useState('')
  const [school, setSchool] = useState<SchoolOption | null>(null)
  const [foreignName, setForeignName] = useState('')

  // Step 2: exchange + the three required program details
  const [exchangeName, setExchangeName] = useState('')
  const [details, setDetails] = useState<FirstExchangeDetails>(EMPTY_FIRST_EXCHANGE_DETAILS)
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const [exchangeBusy, setExchangeBusy] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  function setDetail(key: keyof FirstExchangeDetails, value: string) {
    setDetails(prev => ({ ...prev, [key]: value }))
  }

  // Restore an abandoned step 2 on mount, not as a useState initialiser —
  // reading localStorage during render breaks SSR hydration.
  useEffect(() => {
    const draft = loadDraft(schoolId)
    if (draft) {
      setExchangeName(draft.exchangeName)
      setDetails({
        destination: draft.destination,
        travel_start: draft.travel_start,
        travel_end: draft.travel_end,
      })
    }
    setDraftLoaded(true)
  }, [schoolId])

  useEffect(() => {
    if (!draftLoaded) return
    saveDraft(schoolId, { exchangeName, ...details })
  }, [draftLoaded, schoolId, exchangeName, details])

  // Derived during render, so the organizer sees the problem the moment the
  // second date is picked rather than after pressing Continuer. Null while
  // either date is still blank — required-ness is the submit's job.
  const dateProblem = travelOrderProblem(details.travel_start, details.travel_end)

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
    // Success redirects server-side, so there is no success branch here to
    // clear the draft from. Clear first, restore if the action objects — a
    // rejected submit changes no state, so the autosave effect will not re-fire.
    const snapshot = { exchangeName, ...details }
    clearDraft(schoolId)
    try {
      const problem = await completeFirstExchange(exchangeName, details)
      if (problem) {
        saveDraft(schoolId, snapshot)
        setExchangeError(problem.message)
      }
    } catch {
      saveDraft(schoolId, snapshot)
      setExchangeError('Une erreur est survenue. Réessayez.')
    } finally {
      setExchangeBusy(false)
    }
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
      {dateProblem && <p className="m-0 text-sm text-[#C0392B]">{dateProblem}</p>}
      {exchangeError && <p className="text-sm text-[#C0392B]">{exchangeError}</p>}
      <Button
        type="submit"
        disabled={exchangeBusy || dateProblem !== null}
        className="h-11 w-full rounded-[11px] bg-[#2456E6] text-base font-semibold hover:bg-[#1D48C7] disabled:opacity-50"
      >
        {exchangeBusy ? 'Enregistrement…' : 'Continuer'}
      </Button>
    </form>
  )
}
