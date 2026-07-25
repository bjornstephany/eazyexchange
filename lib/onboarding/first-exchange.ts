// Pure helpers + shared contract for the onboarding "first exchange" step.
// Lives outside the 'use server' action module so values and types can be
// imported by both the action and the client form (a 'use server' file may
// export only async functions).
import { travelPeriodFr } from '@/lib/forms/fillable/render'
import { travelOrderProblem, TRAVEL_ORDER_MESSAGE } from '@/lib/exchange/travel-dates'

// Everything onboarding asks for, and nothing else. The six detail columns that
// used to sit behind « Informations complémentaires (facultatif) » were never
// optional — every one is required by a standard fillable form — so they moved
// to the add-a-form prompt (lib/forms/add-requirements.ts), which asks for
// exactly the missing ones at the moment a form needs them. Two more are now
// derived server-side and never asked at all: sending_school_name from
// schools.name, and sending_city from the school's registry commune.
export type FirstExchangeDetails = {
  destination: string
  travel_start: string
  travel_end: string
}

export const EMPTY_FIRST_EXCHANGE_DETAILS: FirstExchangeDetails = {
  destination: '', travel_start: '', travel_end: '',
}

// completeFirstExchange returns this for expected outcomes instead of throwing
// (Next.js redacts thrown Server Action messages in production). There is no
// success arm: success redirects, so it is never observed by the caller.
export type FirstExchangeProblem = { error: 'invalid' | 'limit'; message: string }

export const CARD_INVALID_MESSAGE =
  'Chaque information renseignée doit avoir un titre.'

export const DETAILS_REQUIRED_MESSAGE =
  'Renseignez la destination et les deux dates du voyage.'

// Re-exported so the onboarding form and its tests keep one import site.
export { TRAVEL_ORDER_MESSAGE }

export function detailsProblem(d: FirstExchangeDetails): string | null {
  if (!d.destination.trim()) return DETAILS_REQUIRED_MESSAGE
  if (!d.travel_start.trim() || !d.travel_end.trim()) return DETAILS_REQUIRED_MESSAGE
  return travelOrderProblem(d.travel_start.trim(), d.travel_end.trim())
}

// The two Info cards students see, derived from the structured values rather
// than typed a second time. These are the only cards onboarding creates — the
// three free-text prompts it used to offer are optional by nature and belong in
// Communication → Infos, which can add them at any time.
export function generatedCards(d: FirstExchangeDetails): { title: string; body: string }[] {
  return [
    { title: 'Destination', body: d.destination.trim() },
    { title: 'Dates clés', body: `Le voyage se déroulera ${travelPeriodFr(d.travel_start, d.travel_end)}.` },
  ]
}
