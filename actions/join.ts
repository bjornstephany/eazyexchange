'use server'
// Public (unauthenticated) organizer-invite acceptance. Service-role only —
// mirrors the anonymous application flow's token-keyed pattern.
import { createAdminClient } from '@/lib/supabase/admin'
import { enforceRateLimit, clientIp } from '@/lib/rate-limit'
import { isPasswordPwned, passwordPolicyError, PWNED_MESSAGE } from '@/lib/auth/hibp'
import { inviteState, type InviteState } from '@/lib/team/invite-state'

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

const JOIN_STATE_MESSAGES: Record<Exclude<JoinInfo['state'], 'ok'>, string> = {
  invalid: 'Ce lien d’invitation est invalide.',
  expired: 'Ce lien d’invitation a expiré — demandez à votre collègue de renvoyer une invitation.',
  revoked: 'Cette invitation a été révoquée.',
  accepted: 'Cette invitation a déjà été utilisée. Connectez-vous.',
}

export async function acceptOrganizerInvite(
  token: string, fullName: string, password: string,
): Promise<{ email: string }> {
  await enforceRateLimit(`join:${await clientIp()}`, 10, 3600)

  const { state, row } = await lookupInvite(token)
  if (state !== 'ok' || !row) throw new Error(JOIN_STATE_MESSAGES[state as Exclude<JoinInfo['state'], 'ok'>])

  const name = fullName.trim()
  if (!name) throw new Error('Indiquez votre nom complet.')
  const policyError = passwordPolicyError(password)
  if (policyError) throw new Error(policyError)
  if (await isPasswordPwned(password)) throw new Error(PWNED_MESSAGE)

  const admin = createAdminClient()

  // Claim the token first (single-use): losing a race means the other request won.
  const { data: claimed } = await admin
    .from('organizer_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', row.id).is('accepted_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) throw new Error(JOIN_STATE_MESSAGES.accepted)

  // Link possession proves e-mail ownership → create the user pre-confirmed.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: row.email, password, email_confirm: true,
  })
  if (createError || !created?.user) {
    await admin.from('organizer_invites').update({ accepted_at: null }).eq('id', row.id)
    throw new Error(
      createError?.code === 'email_exists'
        ? 'Un compte existe déjà avec cette adresse. Connectez-vous.'
        : 'Le compte n’a pas pu être créé. Réessayez.',
    )
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
    throw new Error('Le compte n’a pas pu être créé. Réessayez.')
  }

  return { email: row.email }
}