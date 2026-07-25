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

// The only form. Reports the outcome as a value; the caller decides what that
// means and supplies its own copy. Backed by check_rate_limit() in Postgres
// (atomic fixed window).
//
// There used to be throwing wrappers here (enforceRateLimit /
// enforceRateLimitStrict). They were removed: production redacts thrown Server
// Action messages to an opaque digest, so every caller that hit a cap showed
// the user a hex string — and the message they threw was English, on surfaces
// that are otherwise translated into five languages. Do not reintroduce them.
//
// Each caller keeps the failure mode its key needs:
//   - form-entry caps fail OPEN on 'error' (a DB blip must not block a
//     legitimate applicant),
//   - mail-sending caps fail CLOSED on 'error' (losing the cap would mean
//     unlimited mail from our sending domain).
export async function checkRateLimit(
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
