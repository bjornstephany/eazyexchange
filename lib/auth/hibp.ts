// Have-I-Been-Pwned k-anonymity range check (project decision: leaked-password
// protection is Pro-tier on Supabase, so we self-implement on password-set flows).
// Fails OPEN: an HIBP outage must never block a legitimate password change.

// The policy outcome as a code: every caller reports it through its own copy
// layer — next-intl in Settings → Sécurité, JOIN_ERROR_MESSAGES on /join — so
// this module carries no user-facing strings.
export function passwordPolicyIssue(pw: string): 'too_short' | null {
  return pw.length >= 8 ? null : 'too_short'
}

export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
    const hex = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const prefix = hex.slice(0, 5)
    const suffix = hex.slice(5)
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return false
    const body = await res.text()
    return body.split('\n').some(line => {
      const [sfx, count] = line.trim().split(':')
      return sfx === suffix && parseInt(count ?? '0', 10) > 0
    })
  } catch {
    return false
  }
}
