// Fixed French terms notice for invited applicants — identical for every
// exchange (no per-exchange editing). Used verbatim by BOTH the acceptance
// email (lib/email.ts) and the respond page (components/InviteResponseForm.tsx)
// so the wording can never drift between the two surfaces.
//
// SHIP GATE: this wording must be reviewed before any production deploy — see
// docs/superpowers/specs/2026-07-06-email-controls-acceptance-terms-design.md.

// Shared sentence body — completes « … tu confirmes / tu reconnais … ».
export const EXCHANGE_TERMS_BODY =
  'avoir pris connaissance des conditions de l’échange communiquées par l’établissement (participation aux frais, accueil du correspondant, règles de vie pendant le séjour).'

// Acceptance email variant.
export const EXCHANGE_TERMS_EMAIL =
  `En acceptant l’invitation, tu confirmes — et tes parents confirment — ${EXCHANGE_TERMS_BODY}`

// Respond page variant (where the actual accept click happens).
export const EXCHANGE_TERMS_RESPOND =
  `En cliquant sur « Oui, je veux participer », tu reconnais — et tes parents reconnaissent — ${EXCHANGE_TERMS_BODY}`
