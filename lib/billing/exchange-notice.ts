// Copy + branching for the informational banner shown at the top of the
// "Nouvel échange" modal. Kept as a pure helper (out of the component and the
// 'use server' action file) so the state matrix and pluralization are
// unit-testable in isolation and the modal stays presentational.
//
// At-cap users never reach the modal (the "+ Nouvel échange" affordance
// redirects them to /billing), so `remaining` is always >= 1 here.

export type ExchangeNotice = { tone: 'warning' | 'info'; message: string }

const TRIAL_MESSAGE =
  'Vous êtes en période d’essai : vous ne pouvez créer qu’un seul échange. Abonnez-vous pour en créer davantage.'

function paidMessage(remaining: number): string {
  return remaining === 1
    ? 'Il vous reste 1 échange à créer sur votre offre. En créer un maintenant l’utilisera.'
    : `Il vous reste ${remaining} échanges à créer sur votre offre. En créer un maintenant en consommera un.`
}

export function exchangeNoticeMessage(input: {
  isTrial: boolean
  remaining: number
}): ExchangeNotice | null {
  if (input.isTrial) return { tone: 'warning', message: TRIAL_MESSAGE }
  // Scale (unlimited) has an infinite remaining — no notice is meaningful.
  if (!Number.isFinite(input.remaining)) return null
  return { tone: 'info', message: paidMessage(input.remaining) }
}
