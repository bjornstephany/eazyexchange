import type { Instrumentation } from 'next'

// Fires for every unexpected server error across server actions, RSC renders
// and route handlers. Thin shim over lib/error-reporting: Node-runtime only
// (the reporter needs the crypto module + the service-role client, neither of
// which belongs in the edge bundle — hence the dynamic import), and it never throws.
// Request headers are deliberately not forwarded (cookies, PII).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Positive-condition form (not a negated early return) is deliberate: with
  // middleware.ts present, Next.js also edge-compiles this file, and webpack
  // only dead-code-eliminates the dynamic import — skipping module
  // resolution for the edge bundle entirely — when it sees this exact
  // `if (process.env.NEXT_RUNTIME === 'nodejs') { ... }` shape (same pattern
  // as Next's own instrumentation docs example). An early return here
  // resolves fine at runtime but still gets statically bundled for edge,
  // which fails to compile since the crypto module isn't available there.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { reportServerError } = await import('@/lib/error-reporting')
      // request.path is the raw URL and can carry a query string with secrets
      // (e.g. /auth/confirm?token_hash=...); strip it before it's persisted or
      // fingerprinted. A secret embedded in a path *segment* rather than the
      // query string, under an empty routePath, is a known accepted residual risk.
      await reportServerError(err, {
        routePath: context.routePath || request.path.split('?')[0],
        method: request.method,
      })
    } catch {
      console.error('[error-reporting] onRequestError hook failed')
    }
  }
}
