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
// Backed by check_rate_limit() in Postgres (atomic fixed window).
export const RATE_LIMIT_MESSAGE =
  'Too many attempts. Please wait a little while and try again.'
export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  'This service is temporarily unavailable. Please try again in a few minutes.'

async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<'allowed' | 'limited' | 'error'> {
  const admin = createAdminClient()
  const { data: allowed, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) return 'error'
  return allowed === false ? 'limited' : 'allowed'
}

// Fails OPEN on an unexpected DB error: a transient blip must never block a
// legitimate applicant. Use ONLY for limits that gate form entry — anything
// that sends email uses enforceRateLimitStrict.
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const outcome = await checkRateLimit(key, limit, windowSeconds)
  if (outcome === 'error') {
    // Don't include the key — it can contain an applicant email (PII).
    console.error('[rate-limit] check failed, allowing request')
    return
  }
  if (outcome === 'limited') throw new Error(RATE_LIMIT_MESSAGE)
}

// Fails CLOSED: for the mail-sending keys, a DB blip removing the cap would
// mean unlimited mail from our sending domain (reputation + cost) — refuse
// instead of allowing.
export async function enforceRateLimitStrict(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const outcome = await checkRateLimit(key, limit, windowSeconds)
  if (outcome === 'error') {
    console.error('[rate-limit] check failed, BLOCKING mail-sending request')
    throw new Error(RATE_LIMIT_UNAVAILABLE_MESSAGE)
  }
  if (outcome === 'limited') throw new Error(RATE_LIMIT_MESSAGE)
}
