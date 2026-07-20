// Pure helpers + shared contract for the onboarding "first exchange" step.
// Lives outside the 'use server' action module so values and types can be
// imported by both the action and the client form (a 'use server' file may
// export only async functions).

export type FirstExchangeCard = { title: string; body: string }

// completeFirstExchange returns this for expected outcomes instead of throwing
// (Next.js redacts thrown Server Action messages in production).
export type CompleteFirstExchangeResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'limit' | 'noCards'; message: string }

// Pre-filled, editable card titles shown in the onboarding exchange step.
export const ONBOARDING_CARD_PROMPTS: readonly string[] = [
  'Dates clés',
  'Destination',
  'Hébergement',
  'Contact organisateur',
  'À prévoir',
]

export const NO_CARDS_MESSAGE =
  'Renseignez au moins une information sur le programme.'

export const CARD_INVALID_MESSAGE =
  'Chaque information renseignée doit avoir un titre.'

// Trim both fields; keep only cards the organizer actually filled in (non-empty
// body). Cards left blank are dropped rather than created.
export function filledCards(cards: FirstExchangeCard[]): FirstExchangeCard[] {
  return cards
    .map(c => ({ title: c.title.trim(), body: c.body.trim() }))
    .filter(c => c.body.length > 0)
}
