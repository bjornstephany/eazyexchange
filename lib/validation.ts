// Shared input validation helpers (audit findings L4, L5).

// L4 — student invite emails.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  // Pragmatic check: one @, non-empty local part, a dotted domain, no whitespace.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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

// True if any required field id lacks a non-empty (trimmed) answer. Note: a
// checkbox stores 'true'/'false', both of which count as answered.
export function hasMissingRequired(
  requiredFieldIds: string[],
  answers: Record<string, string>,
): boolean {
  return requiredFieldIds.some(id => (answers[id] ?? '').trim() === '')
}
