'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile } from '@/lib/supabase/request'
import { isPlatformAdmin } from '@/lib/auth/admin'

// Unlike the rest of the app, an unauthorized call here is not an expected
// outcome to surface in the UI — /admin 404s for non-admins, so reaching these
// at all means something is wrong. Throwing is correct; 'Unauthorized' matches
// the string convention in lib/auth/require.ts.
async function requirePlatformAdmin(): Promise<void> {
  const profile = await getProfile()
  if (!profile || !isPlatformAdmin(profile.email)) throw new Error('Unauthorized')
}

async function setStatus(userId: string, status: 'approved' | 'rejected') {
  await requirePlatformAdmin()
  // Service role: `status` and `reviewed_at` have no grant for authenticated,
  // by design (migration 20260725160000).
  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) return { ok: false }
  revalidatePath('/admin')
  return { ok: true }
}

export async function approveUser(userId: string) { return setStatus(userId, 'approved') }
export async function rejectUser(userId: string) { return setStatus(userId, 'rejected') }

// `<form action>` accepts only a void-returning action, so the queue's buttons
// bind these rather than the result-returning pair above. The page re-renders
// from revalidatePath('/admin') either way; a failed write leaves the row's
// status unchanged, which is the visible signal.
export async function approveUserForm(userId: string): Promise<void> { await approveUser(userId) }
export async function rejectUserForm(userId: string): Promise<void> { await rejectUser(userId) }
