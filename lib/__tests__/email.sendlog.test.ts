import { describe, it, expect, vi, beforeEach } from 'vitest'

// Two separate modules are mocked here (resend + @/lib/email-log). Declaring
// their mock fns as plain top-level consts (as the other single-mock email
// test files do) hits a real vi.mock hoisting limitation in this Vitest
// version when more than one module-with-referenced-const is mocked in the
// same file: the second factory sees its const in the temporal dead zone
// ("Cannot access '...' before initialization") because only the module
// email.ts imports *first* gets its backing const initialized in time.
// vi.hoisted() sidesteps this by hoisting both consts together with the
// vi.mock calls, exactly as Vitest's docs recommend for this scenario. Test
// behavior/assertions below are unchanged from the brief.
const { sendMock, logMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ error: null }),
  logMock: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))
vi.mock('@/lib/email-log', () => ({ logEmailSend: logMock }))

import { sendTemplateReminderEmail, sendRejectionEmail } from '@/lib/email'

describe('send log integration', () => {
  beforeEach(() => {
    sendMock.mockClear()
    logMock.mockClear()
    sendMock.mockResolvedValue({ error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('logs a sent row with the caller context', async () => {
    await sendTemplateReminderEmail({
      to: 'eleve@example.com', studentName: 'Léa', templateName: 'Fiche santé',
      exchangeName: 'France-Canada 2026', deadline: null,
      ctx: { schoolId: 'school-1', exchangeId: 'exchange-1' },
    })
    expect(logMock).toHaveBeenCalledWith({
      recipient: 'eleve@example.com',
      kind: 'template reminder email',
      status: 'sent',
      schoolId: 'school-1',
      exchangeId: 'exchange-1',
    })
  })

  it('logs an error row with the Resend status code', async () => {
    sendMock.mockResolvedValueOnce({ error: { name: 'rate_limit_exceeded', statusCode: 429 } })
    const ok = await sendTemplateReminderEmail({
      to: 'eleve@example.com', studentName: '', templateName: 'F', exchangeName: 'E', deadline: null,
    })
    expect(ok).toBe(false)
    expect(logMock).toHaveBeenCalledWith({
      recipient: 'eleve@example.com',
      kind: 'template reminder email',
      status: 'error',
      errorCode: 429,
    })
  })

  it('does not log when email is disabled (no RESEND_API_KEY)', async () => {
    delete process.env.RESEND_API_KEY
    await sendTemplateReminderEmail({ to: 'e@example.com', studentName: '', templateName: 'F', exchangeName: 'E', deadline: null })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('sendRejectionEmail goes through send() and logs', async () => {
    await sendRejectionEmail({
      to: 'eleve@example.com', studentName: 'Léa', formName: 'Fiche santé',
      note: 'Photo illisible', assignmentId: 'a-1',
      ctx: { schoolId: 'school-1', exchangeId: 'exchange-1' },
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].subject).toBe('Action needed: Fiche santé')
    expect(logMock).toHaveBeenCalledWith({
      recipient: 'eleve@example.com',
      kind: 'rejection email',
      status: 'sent',
      schoolId: 'school-1',
      exchangeId: 'exchange-1',
    })
  })
})
