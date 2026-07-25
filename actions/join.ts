'use server'
// Public (unauthenticated) organizer-invite acceptance. Service-role only —
// mirrors the anonymous application flow's token-keyed pattern.
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyIssue } from '@/lib/auth/hibp'
import { inviteState, type InviteState } from '@/lib/team/invite-state'
import { joinError, type JoinResult } from '@/lib/team/join-result'

export type JoinInfo =
  | { state: 'ok'; schoolName: string; email: string }
  | { state: Exclude<InviteState, 'ok'> }

type InviteRow = {
  id: string; school_id: string; email: string
  expires_at: string; accepted_at: string | null; revoked_at: string | null
  schools: { name: string } | null
}

async function lookupInvite(token: string): Promise<{ state: InviteState; row?: InviteRow }> {
  if (!token) return { state: 'invalid' }
  const admin = createAdminClient()
  const { data } = await admin
    .from('organizer_invites')
    .select('id, school_id, email, expires_at, accepted_at, revoked_at, schools(name)')
    .eq('token', token)
    .maybeSingle()
  const row = data as InviteRow | null
  const state = inviteState(row)
  return state === 'ok' && row ? { state, row } : { state }
}

export async function getJoinInvite(token: string): Promise<JoinInfo> {
  const { state, row } = await lookupInvite(token)
  if (state !== 'ok' || !row) return { state } as JoinInfo
  return { state: 'ok', schoolName: row.schools?.name ?? '', email: row.email }
}

// Every outcome below is *expected*, so it comes back as a value: production
// replaces thrown Server Action messages with an opaque digest, which would
// leave an organizer staring at a hex string instead of "password too short".
export async function acceptOrganizerInvite(
  token: string, fullName: string, password: string,
): Promise<JoinResult> {
  const rate = await checkRateLimit(`join:${await clientIp()}`, 10, 3600)
  // Fails OPEN on a DB blip, matching the enforceRateLimit this replaced: a
  // transient error must never wall someone out of accepting their invite.
  if (rate === 'error') console.error('[rate-limit] check failed, allowing request')
  if (rate === 'limited') return joinError('rate_limited')

  const { state, row } = await lookupInvite(token)
  if (state !== 'ok') return joinError(state)
  if (!row) return joinError('invalid')

  const name = fullName.trim()
  if (!name) return joinError('name_required')
  if (passwordPolicyIssue(password) === 'too_short') return joinError('password_too_short')
  if (await isPasswordPwned(password)) return joinError('password_leaked')

  const admin = createAdminClient()

  // Claim the token first (single-use): losing a race means the other request won.
  // Exclude revoked_at so an owner revoking in the window between lookupInvite
  // and this claim cannot be raced into provisioning an account.
  const { data: claimed } = await admin
    .from('organizer_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', row.id).is('accepted_at', null).is('revoked_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) return joinError('accepted')

  // Link possession proves e-mail ownership → create the user pre-confirmed.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: row.email, password, email_confirm: true,
  })
  if (createError || !created?.user) {
    await admin.from('organizer_invites').update({ accepted_at: null }).eq('id', row.id)
    return joinError(createError?.code === 'email_exists' ? 'email_exists' : 'creation_failed')
  }

  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    school_id: row.school_id,
    role: 'organizer',
    org_role: 'admin',
    full_name: name,
    email: row.email,
  })
  if (profileError) {
    // No orphan auth rows (same rollback as provisionOrganizer).
    await admin.auth.admin.deleteUser(created.user.id)
    await admin.from('organizer_invites').update({ accepted_at: null }).eq('id', row.id)
    return joinError('creation_failed')
  }

  return { ok: true, email: row.email }
}