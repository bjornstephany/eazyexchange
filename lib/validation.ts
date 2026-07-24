// Shared input validation helpers (audit findings L4, L5).

// L4 — student invite emails.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Pragmatic address check — deliberately not RFC 5322. Written out rather than
// packed into one regex because the interesting part is *which* holes it closes:
// a trailing dot, a one-letter TLD and doubled dots all passed the old
// `[^\s@]+@[^\s@]+\.[^\s@]+` version, and all three are typos we want to catch
// before Resend 422s on them (one bad recipient fails a whole send).
//
// The local part stays byte-permissive on purpose. An ASCII allowlist — the
// usual "strict" email regex — would reject josé@gmail.com, which is legal and
// does occur in France. Only its dot structure is constrained.
export function isValidEmail(email: string): boolean {
  if (/\s/.test(email)) return false

  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts

  if (local === '') return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false

  const labels = domain.split('.')
  if (labels.length < 2) return false
  if (labels.some(l => l === '' || l.startsWith('-') || l.endsWith('-'))) return false

  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1])
}

// Separators a human might type inside a phone number. Only these are stripped:
// removing *all* non-digits would let "call me on 0612345678" and "06AB123456"
// through, which is exactly the junk this check exists to reject. \s already
// covers U+00A0, the non-breaking space some keyboards insert between pairs.
const PHONE_SEPARATORS = /[\s.\-/()]/g

// Normalized for comparison only — applications store the number as typed, so
// a parent's "06 12 34 56 78" stays readable on the organizer's screen.
export function normalizePhone(raw: string): string {
  return raw.replace(PHONE_SEPARATORS, '')
}

// Accepts anything that could plausibly be a phone number in any country: an
// optional leading + (or 00, which is all digits anyway) and 8-15 digits, the
// E.164 subscriber range. Deliberately not libphonenumber: validating against a
// real numbering plan needs a country, and this form's applicants are by
// definition international while the funnel only collects free-text nationality
// — so a country default would false-reject legitimate foreign numbers.
export function isValidPhone(raw: string): boolean {
  return /^\+?\d{8,15}$/.test(normalizePhone(raw))
}

// L5 — bounds on submitted form answers.
export const MAX_ANSWER_LENGTH = 5000

// True if any answer value exceeds the length cap (storage-abuse guard).
export function hasOverlongAnswer(
  answers: Record<string, string>,
  max: number = MAX_ANSWER_LENGTH,
): boolean {
  // Coerce defensively: server actions receive `data` from the client and the
  // Record<string,string> type isn't enforced at runtime, so a non-string value
  // (object/number) must not slip past the cap with an undefined `.length`.
  return Object.values(answers).some(v => String(v ?? '').length > max)
}

export type RequiredFieldInfo = { id: string; field_type?: string }

// True if any required field lacks an acceptable answer. A required checkbox
// must be explicitly checked: it stores 'true'/'false', and an unchecked box
// ('false') is non-empty, so a plain non-empty test would wrongly accept it.
export function hasMissingRequired(
  requiredFields: RequiredFieldInfo[],
  answers: Record<string, string>,
): boolean {
  return requiredFields.some(f => {
    const v = (answers[f.id] ?? '').trim()
    if (f.field_type === 'checkbox') return v !== 'true'
    return v === ''
  })
}
