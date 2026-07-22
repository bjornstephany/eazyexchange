// Pure helpers + shared contract for the onboarding "first exchange" step.
// Lives outside the 'use server' action module so values and types can be
// imported by both the action and the client form (a 'use server' file may
// export only async functions).
import { travelPeriodFr } from '@/lib/forms/fillable/render'

export type FirstExchangeCard = { title: string; body: string }

// The structured program details collected in step 2. Destination and the two
// travel dates are required — they feed three of the four fillable forms and
// both generated Info cards. The rest is optional: an organizer signing up in
// September may genuinely not know the receiving school yet, and the library
// drawer's add-time prompt collects whatever is still blank.
export type FirstExchangeDetails = {
  destination: string
  travel_start: string
  travel_end: string
  chaperones: string
  association_name: string
  sending_school_name: string
  receiving_school_name: string
  proviseur_name: string
  sending_city: string
}

export const EMPTY_FIRST_EXCHANGE_DETAILS: FirstExchangeDetails = {
  destination: '', travel_start: '', travel_end: '', chaperones: '',
  association_name: '', sending_school_name: '', receiving_school_name: '',
  proviseur_name: '', sending_city: '',
}

// completeFirstExchange returns this for expected outcomes instead of throwing
// (Next.js redacts thrown Server Action messages in production).
export type CompleteFirstExchangeResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'limit'; message: string }

// Free-text card titles still typed by hand. Destination and Dates clés are
// generated from the structured details, so they are no longer prompted.
export const ONBOARDING_CARD_PROMPTS: readonly string[] = [
  'Hébergement',
  'Contact organisateur',
  'À prévoir',
]

export const CARD_INVALID_MESSAGE =
  'Chaque information renseignée doit avoir un titre.'

export const DETAILS_REQUIRED_MESSAGE =
  'Renseignez la destination et les deux dates du voyage.'

export const TRAVEL_ORDER_MESSAGE =
  'La date de retour doit être après la date de départ.'

export function detailsProblem(d: FirstExchangeDetails): string | null {
  if (!d.destination.trim()) return DETAILS_REQUIRED_MESSAGE
  if (!d.travel_start.trim() || !d.travel_end.trim()) return DETAILS_REQUIRED_MESSAGE
  if (d.travel_end < d.travel_start) return TRAVEL_ORDER_MESSAGE
  return null
}

// The two Info cards students see, derived from the structured values rather
// than typed a second time.
export function generatedCards(d: FirstExchangeDetails): FirstExchangeCard[] {
  return [
    { title: 'Destination', body: d.destination.trim() },
    { title: 'Dates clés', body: `Le voyage se déroulera ${travelPeriodFr(d.travel_start, d.travel_end)}.` },
  ]
}

// Trim both fields; keep only cards the organizer actually filled in (non-empty
// body). Cards left blank are dropped rather than created.
export function filledCards(cards: FirstExchangeCard[]): FirstExchangeCard[] {
  return cards
    .map(c => ({ title: c.title.trim(), body: c.body.trim() }))
    .filter(c => c.body.length > 0)
}
