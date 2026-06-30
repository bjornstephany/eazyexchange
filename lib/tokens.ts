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
