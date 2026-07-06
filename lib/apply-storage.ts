// Owns the single localStorage key that lets an applicant resume on the same
// device without the email round-trip. SSR-safe: no-ops when window is absent.

export function resumeStorageKey(slug: string): string {
  return `eazyapply:${slug}`
}

export function storeResumeToken(slug: string, token: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(resumeStorageKey(slug), token) } catch { /* storage disabled */ }
}

export function readResumeToken(slug: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(resumeStorageKey(slug)) } catch { return null }
}

export function clearResumeToken(slug: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(resumeStorageKey(slug)) } catch { /* storage disabled */ }
}
