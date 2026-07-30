import { describe, it, expect, vi, beforeEach } from 'vitest'

type SendPayload = { to: string[]; subject: string; html: string }
const sendMock = vi.fn(async (_payload: SendPayload) => ({ error: null }))
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))
vi.mock('@/lib/email-log', () => ({ logEmailSend: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  sendMock.mockClear()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.ADMIN_EMAILS = 'owner@example.com'
})

describe('sendWaitlistNotificationEmail', () => {
  it('sends to ADMIN_EMAILS and points at the Supabase dashboard, not /admin', async () => {
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({
      fullName: 'Marie Dupont', email: 'm.dupont@ac-lyon.fr', source: 'password',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toEqual(['owner@example.com'])
    expect(call.html).toContain('Marie Dupont')
    expect(call.html).toContain('m.dupont@ac-lyon.fr')
    // The queue is gone; the only interface is SQL in the dashboard.
    expect(call.html).toContain('signup_allowlist')
    expect(call.html).not.toContain('/admin')
  })

  it('names the provider the person came through', async () => {
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({ fullName: 'G User', email: 'g@x.fr', source: 'google' })
    expect(sendMock.mock.calls[0][0].html).toContain('Google')
  })

  it('escapes HTML in the applicant-supplied name', async () => {
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({
      fullName: '<script>alert(1)</script>', email: 'x@y.fr', source: 'password',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('does nothing when ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS
    const { sendWaitlistNotificationEmail } = await import('../email')
    await sendWaitlistNotificationEmail({ fullName: 'A', email: 'a@b.fr', source: 'password' })
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('sendSignupFailureEmail', () => {
  it('reports a failed provision without leaking the reason to the user', async () => {
    const { sendSignupFailureEmail } = await import('../email')
    await sendSignupFailureEmail({ email: 'm.dupont@ac-lyon.fr', reason: 'school_insert_failed' })
    const call = sendMock.mock.calls[0][0]
    expect(call.subject).toMatch(/échec/i)
    expect(call.html).toContain('school_insert_failed')
  })
})
