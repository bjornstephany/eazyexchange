// A Server Action that ends in redirect() reports that to the browser by
// REJECTING the client-side action promise, not by resolving it: Next's
// server-action reducer builds a NEXT_REDIRECT-digest error, rejects the
// promise with it, and then performs the navigation itself. So a client-side
// `try { await action() } catch { ...show an error... }` sees every successful
// redirect as a failure — which flashes a red error over a working submit for
// as long as the navigation takes.
//
// Client-safe counterpart to lib/error-reporting.ts's CONTROL_FLOW_DIGEST_RE.
// Kept separate rather than shared because that module is server-only
// (node:crypto) and matches notFound() too — which is NOT a success and must
// still surface to the user.
//
// The digest format is `NEXT_REDIRECT;<push|replace>;<url>;<status>;`.
const REDIRECT_DIGEST_RE = /^NEXT_REDIRECT;/

/**
 * True when a rejected Server Action promise is Next signalling a successful
 * redirect. Callers should treat it as success and render nothing: the router
 * is already navigating away.
 */
export function isRedirectRejection(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null | undefined)?.digest
  return typeof digest === 'string' && REDIRECT_DIGEST_RE.test(digest)
}
