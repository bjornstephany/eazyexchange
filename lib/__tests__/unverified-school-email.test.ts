import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const send = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))
vi.mock('@/lib/email-log', () => ({ logEmailSend: vi.fn() }))

import { sendUnverifiedSchoolEmail } from '@/lib/email'

const OLD = { ...process.env }
beforeEach(() => {
  send.mockClear()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.FEEDBACK_EMAIL = 'ops@example.com'
})
afterEach(() => { process.env = { ...OLD } })

describe('sendUnverifiedSchoolEmail', () => {
  it('sends to FEEDBACK_EMAIL with the country and school in the subject line', async () => {
    await sendUnverifiedSchoolEmail({
      schoolName: 'Colegio San Miguel', country: 'Espagne', organizerName: 'Ana Ruiz',
    })
    expect(send).toHaveBeenCalledOnce()
    const arg = send.mock.calls[0][0]
    expect(arg.to).toBe('ops@example.com')
    expect(arg.subject).toContain('Colegio San Miguel')
    expect(arg.subject).toContain('Espagne')
    expect(arg.html).toContain('Ana Ruiz')
  })

  it('escapes HTML in the school name', async () => {
    await sendUnverifiedSchoolEmail({
      schoolName: '<script>alert(1)</script>', country: 'Italie', organizerName: 'X',
    })
    expect(send.mock.calls[0][0].html).not.toContain('<script>')
    expect(send.mock.calls[0][0].html).toContain('&lt;script&gt;')
  })

  it('skips silently when FEEDBACK_EMAIL is unset', async () => {
    delete process.env.FEEDBACK_EMAIL
    await sendUnverifiedSchoolEmail({ schoolName: 'X', country: 'Italie', organizerName: 'Y' })
    expect(send).not.toHaveBeenCalled()
  })
})
