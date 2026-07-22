import { normalizeEmail, isValidEmail } from '@/lib/validation'

// Hard cap per send: emailing arbitrary addresses from our sending domain in
// bulk must stay bounded (typical cohorts are 20–60). Not a product limit.
export const MAX_INVITE_BATCH = 200

export type ParsedInviteEmails = { valid: string[]; invalid: string[] }

// Split a pasted blob into normalized, de-duplicated addresses partitioned into
// valid / invalid. De-dupe is by normalized value (first occurrence wins).
export function parseInviteEmails(raw: string): ParsedInviteEmails {
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    if (!token) continue
    const email = normalizeEmail(token)
    if (!email || seen.has(email)) continue
    seen.add(email)
    if (isValidEmail(email)) valid.push(email)
    else invalid.push(email)
  }
  return { valid, invalid }
}
