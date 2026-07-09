import type { User } from '@supabase/supabase-js'
import { getAuthUser, getProfile, type Profile } from '@/lib/supabase/request'

// Shared server-action auth preambles, built on the request-cached
// getAuthUser/getProfile (no extra round trips per call in prod).
// Error strings are load-bearing — tests and callers match on them exactly.

export type AuthCtx = { user: User; profile: Profile }

export async function requireUser(): Promise<User> {
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthenticated')
  return user
}

export async function requireOrganizer(opts?: { orgRole?: 'owner' }): Promise<AuthCtx> {
  const user = await requireUser()
  const profile = await getProfile()
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  if (opts?.orgRole === 'owner' && (profile.org_role ?? 'admin') !== 'owner') {
    throw new Error('Réservé au propriétaire du compte.')
  }
  return { user, profile }
}

export async function requireStudent(): Promise<AuthCtx> {
  const user = await requireUser()
  const profile = await getProfile()
  if (!profile || profile.role !== 'student') throw new Error('Unauthorized')
  return { user, profile }
}
