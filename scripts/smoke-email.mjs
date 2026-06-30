// Prod email smoke test — verifies the verified Resend domain actually delivers
// a real email to an external inbox, using the same FROM as the app.
//
// Secrets are NOT stored in the repo. Vercel marks them Sensitive, so pull the
// values from the Vercel dashboard (Project → Settings → Environment Variables)
// and pass them at runtime:
//
//   RESEND_API_KEY='re_...' \
//   EMAIL_FROM='EazyExchange <noreply@yourdomain.com>' \
//   TEST_EMAIL_TO='you@gmail.com' \
//   node scripts/smoke-email.mjs
//
// Use an external inbox (Gmail/Outlook), NOT your Resend-account address — that's
// the whole point: the resend.dev default only delivers to your own account, so
// testing against it would pass even if the domain weren't verified.
//
// Exit code 0 = Resend accepted the message (check the inbox + spam to confirm
// it actually lands and the From shows your domain). Non-zero = misconfigured.

import { Resend } from 'resend'

const { RESEND_API_KEY, EMAIL_FROM, TEST_EMAIL_TO } = process.env

const missing = ['RESEND_API_KEY', 'EMAIL_FROM', 'TEST_EMAIL_TO'].filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing required env var(s): ${missing.join(', ')}`)
  console.error('See the header of this file for the run command.')
  process.exit(1)
}

if (/onboarding@resend\.dev/i.test(EMAIL_FROM)) {
  console.error('EMAIL_FROM is still the resend.dev default — set it to an address on your verified domain.')
  process.exit(1)
}

const resend = new Resend(RESEND_API_KEY)

const stamp = new Date().toISOString()
const html = `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
    <h2 style="font-weight: 600;">EazyExchange — delivery smoke test</h2>
    <p>If you're reading this in an external inbox, the verified sending domain works.</p>
    <p style="font-size: 12px; color: #94a3b8;">Sent ${stamp} from <code>${EMAIL_FROM}</code></p>
  </div>
`

console.log(`Sending from ${EMAIL_FROM} → ${TEST_EMAIL_TO} ...`)

const { data, error } = await resend.emails.send({
  from: EMAIL_FROM,
  to: TEST_EMAIL_TO,
  subject: `EazyExchange delivery smoke test — ${stamp}`,
  html,
})

if (error) {
  // Log the category only; Resend errors can echo the recipient address (PII).
  console.error('Send FAILED:', error.name ?? 'unknown error')
  console.error('Common causes: domain not fully verified, FROM not on the verified domain, or a bad API key.')
  process.exit(1)
}

console.log(`Accepted by Resend. Message id: ${data?.id}`)
console.log('Now check the inbox (and spam) — confirm it arrives and the From shows your domain.')
