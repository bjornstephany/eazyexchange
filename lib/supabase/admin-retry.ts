// Retry wrapper for Supabase `auth.admin.*` calls.
//
// WHY THIS EXISTS: prod's `sb_secret_*` key intermittently fails `/auth/v1/admin/*`
// with `403 bad_jwt` ("unrecognized JWT kid <nil> for algorithm ES256") at roughly
// a 17–27% rate. Same key, same client, same server action: one call 200s and the
// next 403s a second later. PostgREST with the same key never fails, and the
// user-facing auth routes are clean — so this is specific to the auth-admin
// gateway. Full write-up, including what it is NOT:
// `docs/security/supabase-secret-key-bad-jwt.md`.
//
// There is no fallback credential — this project's legacy anon/service_role keys
// were disabled 2026-06-28, and switching prod back to them broke the
// service-role path for ~25 minutes on 2026-07-24. Retrying is the mitigation.
//
// NARROW ON PURPOSE — retry ONLY `bad_jwt`:
//
//   - `email_exists` from createUser is a legitimate business outcome, not a
//     transient failure. Retrying it would burn attempts and delay a correct
//     answer.
//   - A 403 is NOT sufficient on its own. Roughly 300 rapid requests to this
//     project earn a Cloudflare block that also answers 403, with an HTML body
//     rather than JSON (see the report). Retrying into that makes it worse, so
//     the discriminator is the `bad_jwt` code, never the status alone.
//
// Supabase's auth-admin methods resolve `{ data, error }` rather than throwing,
// so this wraps a thunk and inspects the result. It deliberately does NOT import
// the admin client: callers pass their own, which keeps this file out of the
// service-role allowlist in `admin-allowlist.test.ts`.

export const AUTH_ADMIN_ATTEMPTS = 3
/** Backoff before attempts 2 and 3. One entry shorter than ATTEMPTS by design. */
export const AUTH_ADMIN_BACKOFF_MS = [150, 400]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type AdminError = { code?: string; status?: number; message?: string } | null

/**
 * True for the intermittent `sb_secret_` credential failure, and nothing else.
 *
 * Matches the `bad_jwt` code first — that is what the incident report counted.
 * The message check is a fallback for clients that surface the string without a
 * code; it is anchored on the distinctive `kid <nil>` / `bad_jwt` wording rather
 * than anything generic like "JWT", so an ordinary auth rejection cannot match.
 */
export function isBadJwtError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as AdminError
  if (e?.code === 'bad_jwt') return true
  const message = typeof e?.message === 'string' ? e.message : ''
  return /bad_jwt|unrecognized JWT kid/i.test(message)
}

/**
 * Run an `auth.admin.*` call, retrying only on `bad_jwt`.
 *
 * Returns the LAST result either way — callers keep their existing error
 * handling untouched and simply see fewer transient failures. Exhausting the
 * attempts is logged, because a call that fails all three is a real incident
 * signal rather than noise.
 *
 * `label` names the call site in logs. Never pass an email or any other student
 * or parent identifier: these logs are not PII-safe.
 */
export async function withAuthAdminRetry<T extends { error: AdminError }>(
  operation: () => Promise<T>,
  label: string,
): Promise<T> {
  let result = await operation()
  for (let attempt = 1; attempt < AUTH_ADMIN_ATTEMPTS; attempt++) {
    if (!isBadJwtError(result.error)) return result
    const backoff = AUTH_ADMIN_BACKOFF_MS[attempt - 1]
    if (backoff !== undefined) await sleep(backoff)
    result = await operation()
  }
  if (isBadJwtError(result.error)) {
    console.warn(
      `[auth-admin] ${label}: bad_jwt after ${AUTH_ADMIN_ATTEMPTS} attempts — giving up`,
    )
  }
  return result
}
