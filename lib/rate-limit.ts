import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// Best-effort client IP from the proxy headers Vercel sets. Falls back to
// 'unknown' so a missing header collapses everyone into one shared bucket
// (fail-safe: still rate-limited, just coarsely) rather than throwing.
export async function clientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return h.get('x-real-ip')?.trim() || 'unknown'
}

// Throws RATE_LIMIT_MESSAGE when `key` exceeds `limit` calls per `windowSeconds`.
// Backed by check_rate_limit() in Postgres (atomic fixed window). Fails OPEN on
// an unexpected DB error so a transient blip never blocks a legitimate applicant.
export const RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a little while and try again.'

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const admin = createAdminClient()
  const { data: allowed, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // Don't include the key — it can contain an applicant email (PII).
    console.error('[rate-limit] check failed, allowing request:', error.code ?? 'unknown')
    return
  }
  if (allowed === false) throw new Error(RATE_LIMIT_MESSAGE)
}
