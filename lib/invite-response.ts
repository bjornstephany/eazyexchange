// Shared contract for the invitation actions' *expected* outcomes.
// Lives outside the 'use server' module so both the actions and the client
// components can import the type and messages — a 'use server' file may only
// export async functions. Same pattern as lib/billing/exchange-limit.ts:
// Next.js redacts thrown Server Action error messages in production, so
// expected results must travel as return values, in French (student-facing).

export type InviteErrorCode =
  | 'not_found'      // token matches no application
  | 'expired'        // invite_token_expires_at is past
  | 'closed'         // invitation already answered / not open
  | 'email_exists'   // an account already exists for this email
  | 'retry'          // enrollment succeeded but the session mint failed — click « Oui » again
  | 'archived'       // exchange archived (read-only)

export const INVITE_ERROR_MESSAGES: Record<InviteErrorCode, string> = {
  not_found: 'Cette invitation est introuvable. Vérifie le lien dans ton e-mail.',
  expired: 'Cette invitation a expiré. Contacte ton organisateur pour en recevoir une nouvelle.',
  closed: 'Cette invitation n’est plus ouverte.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail. Connecte-toi depuis la page de connexion.',
  retry: 'Ton inscription est bien enregistrée, mais la connexion automatique a échoué. Clique à nouveau sur « Oui, je veux participer » pour accéder à ton compte.',
  archived: 'Programme archivé — lecture seule.',
}

export type InviteActionResult =
  | { ok: true }
  | { ok: false; error: InviteErrorCode; message: string }

export function inviteError(code: InviteErrorCode): InviteActionResult {
  return { ok: false, error: code, message: INVITE_ERROR_MESSAGES[code] }
}
