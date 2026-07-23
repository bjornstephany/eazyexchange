// The one travel-date ordering rule, shared by every surface that writes
// exchange_program_details: onboarding's first-exchange step, Réglages →
// Programme, and the library drawer's add-time detail prompt. Pure — the
// dates are ISO `YYYY-MM-DD` strings straight off <input type="date">, so
// lexicographic comparison is chronological and needs no Date parsing.
export const TRAVEL_ORDER_MESSAGE =
  'La date de retour doit être après la date de départ.'

// Null when the pair is fine OR when either date is still blank — required-ness
// is each caller's own rule (onboarding demands both, Réglages allows neither).
// A return on the same day as the departure is rejected: exchanges span nights,
// and identical dates are always a data-entry slip.
export function travelOrderProblem(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start || !end) return null
  return end > start ? null : TRAVEL_ORDER_MESSAGE
}
