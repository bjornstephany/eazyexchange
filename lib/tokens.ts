import { randomBytes } from 'crypto'

// URL-safe secret for resume/invite links. 24 bytes ≈ 32 base64url chars.
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

// Public apply-link slug: slugified name + short random suffix for uniqueness.
export function applySlug(name: string): string {
  const base = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'exchange'}-${randomBytes(4).toString('hex')}`
}

// Shared expiry check for resume/invite token links.
export function tokenExpired(expiresAt: string | null): boolean {
  return expiresAt != null && new Date(expiresAt).getTime() < Date.now()
}

const RESUME_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000

// When a resume/invite link should die: end of the deadline day (the day after,
// 00:00 UTC — the moment applications close), or 30 days out if no deadline.
export function resumeTokenExpiry(deadline: string | null): string {
  if (deadline) return new Date(new Date(`${deadline}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000).toISOString()
  return new Date(Date.now() + RESUME_FALLBACK_MS).toISOString()
}
