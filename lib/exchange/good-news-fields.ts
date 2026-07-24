// Which values the « Bonne nouvelle » acceptance email needs before it can be
// sent without [à compléter] placeholders. Pure — no React, no Supabase — so
// the send guard, the Réglages card and the tests share one definition.
//
// Deliberately NOT expressed over ProgramDetailsValues. That type means « what
// the fillable forms consume », and `keyof ProgramDetailsValues` is load-bearing
// in DETAIL_LABELS, DETAIL_ORDER, EMPTY_DETAILS and ProgramDetailFields —
// adding these keys there would make the add-a-form prompt ask for a payment
// link when an organizer adds a medical form.
//
// Structurally satisfied by an exchange_program_details row, so callers pass
// the generated Row straight in.

export type GoodNewsValues = {
  travel_start: string | null
  travel_end: string | null
  participation_cost: string | null
  payment_details: string | null
  confirmation_deadline: string | null
}

export type GoodNewsField =
  | 'travel_dates'
  | 'participation_cost'
  | 'payment_details'
  | 'confirmation_deadline'

// Canonical display order — drives both the guard's message and any UI listing
// what is still missing, so the organizer always sees the same sequence.
export const GOOD_NEWS_FIELD_ORDER: readonly GoodNewsField[] = [
  'travel_dates', 'participation_cost', 'payment_details', 'confirmation_deadline',
]

// French, not localized — same convention as DETAIL_LABELS.
export const GOOD_NEWS_FIELD_LABELS: Record<GoodNewsField, string> = {
  travel_dates: 'Dates du séjour',
  participation_cost: 'Participation aux frais',
  payment_details: 'Adhésion / paiement',
  confirmation_deadline: 'Date limite de confirmation',
}

function blank(v: string | null | undefined): boolean {
  return (v ?? '').trim() === ''
}

// The travel period counts as one entry: a half-filled period renders as badly
// as no period at all, and the two dates are always collected together.
export function missingGoodNewsFields(d: GoodNewsValues | null): GoodNewsField[] {
  if (!d) return [...GOOD_NEWS_FIELD_ORDER]
  const missing: GoodNewsField[] = []
  if (blank(d.travel_start) || blank(d.travel_end)) missing.push('travel_dates')
  if (blank(d.participation_cost)) missing.push('participation_cost')
  if (blank(d.payment_details)) missing.push('payment_details')
  if (blank(d.confirmation_deadline)) missing.push('confirmation_deadline')
  return missing
}
