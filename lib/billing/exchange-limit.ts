// Shared contract for the createExchange server action's *expected* outcomes.
// These live outside the `'use server'` module so a value (the message) and a
// type can be exported and imported by both the action and the client modal —
// a 'use server' file may only export async functions.

export const EXCHANGE_LIMIT_MESSAGE =
  "Vous avez atteint la limite d'échanges de votre offre. Abonnez-vous pour en ajouter."

export const EXCHANGE_INVALID_MESSAGE =
  "Veuillez renseigner le nom de l’échange."

// createExchange returns this for expected outcomes instead of throwing.
// Next.js redacts thrown Server Action error messages in production, so a
// thrown Error can never carry a message the client can branch on — the client
// only ever receives the opaque "An error occurred in the Server Components
// render" string. Expected results must therefore travel as return values.
export type CreateExchangeResult =
  | { ok: true; inviteErrors?: { email: string; message: string }[] }
  | { ok: false; error: 'limit' | 'invalid'; message: string }
