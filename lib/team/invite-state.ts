// Single-use organizer-invite token lifecycle. Order matters: an explicit
// revocation beats acceptance beats expiry.
export type InviteState = 'ok' | 'invalid' | 'expired' | 'revoked' | 'accepted'

export function inviteState(
  row: { expires_at: string; accepted_at: string | null; revoked_at: string | null } | null,
  now: Date = new Date(),
): InviteState {
  if (!row) return 'invalid'
  if (row.revoked_at) return 'revoked'
  if (row.accepted_at) return 'accepted'
  if (new Date(row.expires_at).getTime() < now.getTime()) return 'expired'
  return 'ok'
}
