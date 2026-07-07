import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendTemplateReminderEmail, sendPhase2ChecklistEmail } from '@/lib/email'

describe('forms emails', () => {
  beforeEach(() => { sendMock.mockClear(); process.env.RESEND_API_KEY = 'test-key' })

  it('reminder email escapes user content and mentions the deadline', async () => {
    const ok = await sendTemplateReminderEmail({
      to: 's@x.fr', studentName: '<Léa>', templateName: 'Passeport <b>', exchangeName: 'Espagne', deadline: '2026-10-10T00:00:00+00:00',
    })
    expect(ok).toBe(true)
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toBe('s@x.fr')
    expect(call.html).toContain('&lt;Léa&gt;')
    expect(call.html).toContain('Passeport &lt;b&gt;')
    expect(call.html).not.toContain('<Léa>')
    expect(call.html).toContain('10 oct')
    expect(call.subject).toContain('Passeport')
  })

  it('checklist email lists every pending item', async () => {
    await sendPhase2ChecklistEmail({
      to: 's@x.fr', studentName: 'Léa', exchangeName: 'Espagne',
      items: [{ name: 'Passeport', deadline: '2026-10-10T00:00:00+00:00' }, { name: 'AST', deadline: null }],
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('Passeport')
    expect(call.html).toContain('AST')
    expect(call.html).toContain('/my-forms')
  })

  it('returns false when Resend reports an error', async () => {
    sendMock.mockResolvedValueOnce({ error: { name: 'x', statusCode: 500 } })
    const ok = await sendTemplateReminderEmail({
      to: 's@x.fr', studentName: 'Léa', templateName: 'Passeport', exchangeName: 'Espagne', deadline: null,
    })
    expect(ok).toBe(false)
  })

  it('renders the wordmark in brand blue, not green', async () => {
    await sendTemplateReminderEmail({
      to: 's@x.fr', studentName: 'Léa', templateName: 'Passeport', exchangeName: 'Espagne', deadline: null,
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('<span style="color: #2456E6;">Eazy</span>Exchange')
    expect(call.html).not.toContain('#3FA277')
  })
})
