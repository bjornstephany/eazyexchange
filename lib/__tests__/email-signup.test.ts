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

describe('sendSignupRequestEmail', () => {
  it('sends the request details to ADMIN_EMAILS', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: 'Marie Dupont', email: 'm.dupont@ac-lyon.fr',
      schoolLabel: 'Lycée Jean Moulin', roleDescription: 'Professeure',
      howFoundUs: 'Recommandation', viaGoogle: false,
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toEqual(['owner@example.com'])
    expect(call.html).toContain('Lycée Jean Moulin')
    expect(call.html).toContain('/admin')
  })

  it('escapes HTML in the applicant-supplied fields', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: '<script>alert(1)</script>', email: 'x@y.fr',
      schoolLabel: 'A', roleDescription: 'B', howFoundUs: 'C', viaGoogle: false,
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('marks a Google signup as having no details', async () => {
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: 'G User', email: 'g@y.fr',
      schoolLabel: '—', roleDescription: '—', howFoundUs: '—', viaGoogle: true,
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('via Google')
  })

  it('does nothing when ADMIN_EMAILS is unset', async () => {
    delete process.env.ADMIN_EMAILS
    const { sendSignupRequestEmail } = await import('../email')
    await sendSignupRequestEmail({
      fullName: 'A', email: 'a@b.fr', schoolLabel: '—',
      roleDescription: '—', howFoundUs: '—', viaGoogle: false,
    })
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
