// Platform-admin identity, deliberately NOT a database column: there is no row
// to escalate and no policy that can leak it. Rotating access is a Vercel env
// edit plus a redeploy. Distinct from users.org_role, which is school-level.
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return allowed.includes(email.trim().toLowerCase())
}
