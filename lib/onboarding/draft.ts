// Onboarding step 2 autosaves here so closing the tab does not discard
// everything typed. Step 1 already persists server-side (claim_school writes
// schools.name/uai/country), so this covers the only unsaved stretch of the
// flow.
//
// Best effort by design: a browser with storage disabled, in private mode, or
// with a full quota must degrade to the previous behaviour — retyping four
// fields — and must never break onboarding. Every access is wrapped.
//
// School-scoped, and school/trip data only: no student or parent PII ever
// reaches localStorage.

export type OnboardingDraft = {
  exchangeName: string
  destination: string
  travel_start: string
  travel_end: string
}

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  exchangeName: '', destination: '', travel_start: '', travel_end: '',
}

// Bumped if the shape changes; a draft written by another version is discarded
// rather than half-restored.
const VERSION = 1

export function draftKey(schoolId: string): string {
  return `eazyexchange:onboarding-draft:${schoolId}`
}

export function serializeDraft(d: OnboardingDraft): string {
  return JSON.stringify({ v: VERSION, ...d })
}

export function parseDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || parsed.v !== VERSION) return null
    const str = (k: keyof OnboardingDraft) =>
      typeof parsed[k] === 'string' ? (parsed[k] as string) : ''
    return {
      exchangeName: str('exchangeName'),
      destination: str('destination'),
      travel_start: str('travel_start'),
      travel_end: str('travel_end'),
    }
  } catch {
    return null
  }
}

export function isEmptyDraft(d: OnboardingDraft): boolean {
  return Object.values(d).every(v => v.trim() === '')
}

export function loadDraft(schoolId: string): OnboardingDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(draftKey(schoolId)))
  } catch {
    return null
  }
}

export function saveDraft(schoolId: string, d: OnboardingDraft): void {
  try {
    if (isEmptyDraft(d)) {
      window.localStorage.removeItem(draftKey(schoolId))
      return
    }
    window.localStorage.setItem(draftKey(schoolId), serializeDraft(d))
  } catch {
    // Quota exceeded or storage unavailable — the draft is a convenience.
  }
}

export function clearDraft(schoolId: string): void {
  try {
    window.localStorage.removeItem(draftKey(schoolId))
  } catch {
    // As above.
  }
}
