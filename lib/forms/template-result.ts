// Shared contract for the template server actions' *expected* outcomes.
// Lives outside the 'use server' module so values (messages) and types can be
// imported by both the actions and client components — a 'use server' file may
// only export async functions. Production redacts thrown Server Action error
// messages, so expected validation outcomes must travel as return values
// (pattern: lib/billing/exchange-limit.ts).

export const MSG_DEADLINE_REQUIRED = 'Ajoutez une échéance avant d’activer.'
export const MSG_PDF_REQUIRED = 'Téléversez le PDF avant d’activer.'
export const MSG_QUESTIONS_REQUIRED = 'Ajoutez au moins une question avant d’activer.'

export type TemplateActionResult = { ok: true } | { ok: false; message: string }
export type CreateTemplateResult = { ok: true; id: string } | { ok: false; message: string }
