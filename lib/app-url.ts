// Base URL for links we embed in emails and auth redirects.
//
// Prefer an explicit NEXT_PUBLIC_APP_URL (set in Production → the custom
// domain). On Vercel preview deployments that variable is intentionally left
// unset, so fall back to the deployment's own Vercel URL — VERCEL_BRANCH_URL is
// the stable per-branch alias; VERCEL_URL is the per-deployment host. This makes
// a preview's emailed links point back at that same preview instead of
// localhost. Local dev (no Vercel vars) falls back to localhost.
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit
  const vercelHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  if (vercelHost) return `https://${vercelHost}`
  return 'http://localhost:3000'
}
