// Have-I-Been-Pwned k-anonymity range check (project decision: leaked-password
// protection is Pro-tier on Supabase, so we self-implement on password-set flows).
// Fails OPEN: an HIBP outage must never block a legitimate password change.

export const PWNED_MESSAGE =
  'Ce mot de passe apparaît dans des fuites de données connues — choisissez-en un autre.'

// The policy outcome as a code, so a caller that reports through translated
// strings (Settings → Sécurité) can map it itself instead of surfacing the
// hardcoded French below.
export function passwordPolicyIssue(pw: string): 'too_short' | null {
  return pw.length >= 8 ? null : 'too_short'
}

export function passwordPolicyError(pw: string): string | null {
  return passwordPolicyIssue(pw) === null
    ? null
    : 'Le mot de passe doit contenir au moins 8 caractères.'
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
