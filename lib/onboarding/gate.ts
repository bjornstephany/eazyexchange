// True when an organizer must be sent to /onboarding: either the school has no
// name yet, or the school owns no exchange. Shared by the organizer layout
// (hard gate) and the onboarding page (which step to show / bounce home).
export function mustOnboard(schoolName: string, ownedExchangeCount: number): boolean {
  return schoolName === '' || ownedExchangeCount === 0
}
