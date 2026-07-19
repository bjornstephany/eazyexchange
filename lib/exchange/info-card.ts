export const INFO_TITLE_MAX = 120
export const INFO_BODY_MAX = 2000

export type InfoCardInput = { title: string; body: string }
export type InfoCardError = 'titleRequired' | 'titleTooLong' | 'bodyTooLong'

export function validateInfoCard(
  input: { title: string; body: string },
): { ok: true; value: InfoCardInput } | { ok: false; error: InfoCardError } {
  const title = input.title.trim()
  const body = input.body.trim()
  if (title.length === 0) return { ok: false, error: 'titleRequired' }
  if (title.length > INFO_TITLE_MAX) return { ok: false, error: 'titleTooLong' }
  if (body.length > INFO_BODY_MAX) return { ok: false, error: 'bodyTooLong' }
  return { ok: true, value: { title, body } }
}
