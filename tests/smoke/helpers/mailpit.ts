import { LOCAL_INBOX_URL } from '../../../scripts/lib/local-target.mjs'

// Mailpit, on :54324. Its API is `/api/v1/messages` + `/api/v1/message/{id}` —
// it is NOT Inbucket, whose /api/v1/mailbox 404s here. Supabase auth mail still
// lands here even though RESEND_API_KEY is unset locally, because auth mail
// does not route through Resend.

type Summary = { ID: string; Subject: string; To?: { Address: string }[] }
type Body = { Subject: string; HTML: string; Text: string }

export async function waitForMessage(
  to: string,
  timeoutMs = 30_000,
): Promise<{ subject: string; html: string }> {
  const target = to.toLowerCase()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const res = await fetch(`${LOCAL_INBOX_URL}/api/v1/messages?limit=200`)
    if (res.ok) {
      const { messages } = (await res.json()) as { messages: Summary[] }
      const hit = messages.find((m) => (m.To ?? []).some((t) => t.Address.toLowerCase() === target))
      if (hit) {
        const full = await fetch(`${LOCAL_INBOX_URL}/api/v1/message/${hit.ID}`)
        const body = (await full.json()) as Body
        return { subject: body.Subject, html: body.HTML || body.Text }
      }
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No message for ${to} in the local inbox (${LOCAL_INBOX_URL}) after ${timeoutMs}ms. ` +
          'Is [auth.email] enable_confirmations = true in supabase/config.toml, and has the ' +
          'stack been restarted since that change?',
      )
    }
    await new Promise((r) => setTimeout(r, 500))
  }
}

/**
 * The `/auth/confirm?...` path out of a confirmation mail. Asserting this shape
 * is the point of the signup spec: the default Supabase template links to
 * `{{ .ConfirmationURL }}` → GET /auth/v1/verify, which bypasses
 * app/auth/confirm/route.ts entirely and leaves the browser with no session.
 */
export function confirmPathFrom(html: string): string {
  const match = html.match(/\/auth\/confirm\?[^"'\s<]+/)
  if (!match) {
    throw new Error(
      'The confirmation mail carries no /auth/confirm link. The local template ' +
        '(supabase/templates/confirmation.html) is wrong, or config.toml does not point at it.',
    )
  }
  return match[0].replace(/&amp;/g, '&')
}
