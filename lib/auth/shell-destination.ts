// Where a request lands when it reaches a role shell (the organizer app or the
// student app). Pure so the anti-loop property below is testable.
//
// The bug this exists to prevent: both shells used to write their guard as
// "not my role → go to the other shell" (`profile?.role !== 'organizer'`),
// which quietly folds in the case of *no profile at all*. getProfile() returns
// null whenever the users row is unreadable — it discards the error from
// .single() — so a null profile satisfied both guards at once and /dashboard
// and /my-forms redirected into each other until the browser aborted. The user
// saw a blank tab. A freshly confirmed signup is the likely trigger: the users
// row is written with the admin client, then read back through the user's own
// RLS-scoped client one redirect later.
//
// So "no profile" must leave the shells entirely rather than pick the other one.
// /login is terminal for such a session: middleware.ts explicitly lets a session
// with no users row reach the auth routes instead of bouncing it onward.

export type ProfileRole = 'organizer' | 'student'
export type Shell = 'organizer' | 'student'

export const PROFILE_MISSING_DESTINATION = '/login?error=profile_missing'

const OWN_SHELL: Record<Shell, string> = {
  organizer: '/dashboard',
  student: '/my-forms',
}

/**
 * The path to redirect to, or `null` to render the shell.
 *
 * @param role  the profile's role, or null/undefined when there is no profile
 * @param shell the shell the request has reached
 */
export function shellDestination(
  role: ProfileRole | null | undefined,
  shell: Shell,
): string | null {
  if (!role) return PROFILE_MISSING_DESTINATION
  if (role === shell) return null
  return OWN_SHELL[role]
}
