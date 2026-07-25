// Shared contract for the organizer-invite acceptance action's *expected*
// outcomes. Lives outside the 'use server' module so both the action and the
// client form can import the codes and messages — a 'use server' file may only
// export async functions. Same pattern as lib/invite-response.ts: Next.js
// redacts thrown Server Action error messages in production, so expected
// results must travel as return values, in French (organizer-facing).
import type { InviteState } from '@/lib/team/invite-state'

export type JoinErrorCode =
  // The token's own lifecycle, straight from inviteState().
  | Exclude<InviteState, 'ok'>
  | 'rate_limited'        // too many attempts from this IP
  | 'name_required'       // full name blank
  | 'password_too_short'  // below the 8-character policy
  | 'password_leaked'     // found in the HIBP corpus
  | 'email_exists'        // an auth user already owns this address
  | 'creation_failed'     // account creation rolled back — retryable

export const JOIN_ERROR_MESSAGES: Record<JoinErrorCode, string> = {
  invalid: 'Ce lien d’invitation est invalide.',
  expired: 'Ce lien d’invitation a expiré — demandez à votre collègue de renvoyer une invitation.',
  revoked: 'Cette invitation a été révoquée.',
  accepted: 'Cette invitation a déjà été utilisée. Connectez-vous.',
  rate_limited: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
  name_required: 'Indiquez votre nom complet.',
  password_too_short: 'Le mot de passe doit contenir au moins 8 caractères.',
  password_leaked:
    'Ce mot de passe apparaît dans des fuites de données connues — choisissez-en un autre.',
  email_exists: 'Un compte existe déjà avec cette adresse. Connectez-vous.',
  creation_failed: 'Le compte n’a pas pu être créé. Réessayez.',
}

export type JoinResult =
  | { ok: true; email: string }
  | { ok: false; error: JoinErrorCode; message: string }

export function joinError(code: JoinErrorCode): JoinResult {
  return { ok: false, error: code, message: JOIN_ERROR_MESSAGES[code] }
}
