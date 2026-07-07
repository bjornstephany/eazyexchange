import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendFeedbackNotificationEmail } from '@/lib/email'

describe('sendFeedbackNotificationEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    process.env.RESEND_API_KEY = 'test-key'
    process.env.FEEDBACK_EMAIL = 'bjorn@example.com'
  })

  it('escapes HTML in message, school, and organizer name; sends to FEEDBACK_EMAIL', async () => {
    await sendFeedbackNotificationEmail({
      type: 'bug',
      schoolName: 'Lycée <Mistral>',
      organizerName: 'Marie <B>',
      pagePath: '/dashboard',
      message: 'Le bouton <script> ne marche pas',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const { to, subject, html } = sendMock.mock.calls[0][0]
    expect(to).toBe('bjorn@example.com')
    expect(subject).toBe('Nouveau feedback (bug) — Lycée <Mistral>')
    expect(html).toContain('Lycée &lt;Mistral&gt;')
    expect(html).toContain('Marie &lt;B&gt;')
    expect(html).toContain('Le bouton &lt;script&gt; ne marche pas')
    expect(html).not.toContain('<script>')
  })

  it('does nothing when FEEDBACK_EMAIL is unset', async () => {
    delete process.env.FEEDBACK_EMAIL
    await sendFeedbackNotificationEmail({
      type: 'suggestion',
      schoolName: 'S',
      organizerName: 'N',
      pagePath: null,
      message: 'hi',
    })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
