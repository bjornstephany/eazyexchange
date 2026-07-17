import { createHash } from 'node:crypto'

export const MESSAGE_MAX = 2000
export const STACK_MAX = 8000

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
// 4+ digits: long enough to be an id/timestamp, short enough that HTTP status
// codes (404 vs 500) keep producing distinct fingerprints.
const LONG_DIGITS_RE = /\d{4,}/g
const EMAIL_RE = /[^\s@<>()[\]:;,"']+@[^\s@<>()[\]:;,"']+\.[a-zA-Z]{2,}/g

// Group "Exchange abc not found" and "Exchange def not found" as ONE bug:
// ids collapse to placeholders before fingerprinting. Stored messages keep
// their concrete ids (useful when debugging); only emails are stripped.
export function normalizeMessage(message: string): string {
  return message.replace(UUID_RE, '<uuid>').replace(LONG_DIGITS_RE, '<n>')
}

export function redactEmails(text: string): string {
  return text.replace(EMAIL_RE, '<email>')
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

// Stack frames deliberately excluded from the fingerprint: minified frame
// text changes across deploys and would split one bug into many rows.
export function errorFingerprint(normalizedMessage: string, routePath: string): string {
  return createHash('sha256').update(`${normalizedMessage}\n${routePath}`).digest('hex')
}
