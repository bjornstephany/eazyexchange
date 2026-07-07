import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail, isValidEmail } from '@/lib/validation'
import { randomToken } from '@/lib/tokens'
import { sendOrganizerInviteEmail } from '@/lib/email'

export type InviteResult = { ok: true } | { ok: false; message: string }

// Shared organizer-invite mechanics: dedupe → insert pending row → send email,
// rolling back the row if the email never goes out (no orphan pending invites).
// The caller supplies a service-role admin client and has ALREADY authorized
// the action (owner-gate + rate-limit live in the calling server action).
// Returns a structured result so strict callers (inviteOrganizer) can throw and
// best-effort callers (createExchange) can collect failures.
export async function createAndSendOrganizerInvite(
  admin: SupabaseClient,
  opts: { schoolId: string; email: string; inviterUserId: string; inviterName: string; appUrl: string },
): Promise<InviteResult> {
  const email = normalizeEmail(opts.email)
  if (!isValidEmail(email)) return { ok: false, message: 'Adresse e-mail invalide.' }

  const { data: existingMember } = await admin
    .from('users').select('id')
    .eq('school_id', opts.schoolId).eq('email', email).maybeSingle()
  if (existingMember) return { ok: false, message: 'Cette personne fait déjà partie de votre équipe.' }

  const { data: existingInvite } = await admin
    .from('organizer_invites').select('id')
    .eq('school_id', opts.schoolId).eq('email', email)
    .is('accepted_at', null).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (existingInvite) return { ok: false, message: 'Une invitation est déjà en attente pour cette adresse.' }

  const { data: school } = await admin
    .from('schools').select('name').eq('id', opts.schoolId).single()

  const token = randomToken()
  const { data: invite, error: insertError } = await admin
    .from('organizer_invites')
    .insert({ school_id: opts.schoolId, email, token, invited_by: opts.inviterUserId })
    .select('id').single()
  if (insertError || !invite) return { ok: false, message: 'L’invitation n’a pas pu être créée. Réessayez.' }

  const ok = await sendOrganizerInviteEmail({
    to: email, inviterName: opts.inviterName, schoolName: school?.name ?? '',
    joinUrl: `${opts.appUrl}/join/${token}`,
  })
  if (!ok) {
    await admin.from('organizer_invites').delete().eq('id', invite.id)
    return { ok: false, message: 'L’e-mail d’invitation n’a pas pu être envoyé. Réessayez.' }
  }
  return { ok: true }
}
