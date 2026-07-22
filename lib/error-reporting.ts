import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const MESSAGE_MAX = 2000
export const STACK_MAX = 8000
export const ROUTE_PATH_MAX = 500

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

// Next.js control-flow "errors" (redirect(), notFound()) carry these digest
// prefixes — they are working as designed, never bugs.
const CONTROL_FLOW_DIGEST_RE = /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/

export type ServerErrorContext = { routePath: string; method: string }

// Record an unexpected server error in the error_reports bug list (service
// role only — clients have no path to the table, see the error_reports
// migration). Same contract as logAudit: await it, but it NEVER throws —
// a bug-logging hiccup must not worsen the user's error experience. PII rule:
// the console fallback logs error codes only, never message contents.
export async function reportServerError(err: unknown, ctx: ServerErrorContext): Promise<void> {
  try {
    const digestProp = (err as { digest?: unknown } | null)?.digest
    const digest = typeof digestProp === 'string' ? digestProp : null
    if (digest && CONTROL_FLOW_DIGEST_RE.test(digest)) return

    const rawMessage = err instanceof Error ? err.message : String(err)
    const rawStack = err instanceof Error && err.stack ? err.stack : null
    const message = truncate(redactEmails(rawMessage), MESSAGE_MAX)
    const stack = rawStack ? truncate(redactEmails(rawStack), STACK_MAX) : null

    const routePath = truncate(ctx.routePath, ROUTE_PATH_MAX)

    const admin = createAdminClient()
    const { error } = await admin.rpc('record_error_report', {
      p_fingerprint: errorFingerprint(normalizeMessage(message), routePath),
      p_message: message,
      p_route_path: routePath,
      p_method: ctx.method,
      p_stack: stack ?? undefined,
      p_digest: digest ?? undefined,
    })
    if (error) console.error('[error-reporting] write failed:', error.code ?? 'unknown')
  } catch {
    console.error('[error-reporting] write failed: unexpected')
  }
}
