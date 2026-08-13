import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('resend', () => ({ Resend: class { emails = { send: sendMock } } }))

import { sendTemplateRequestEmail } from '@/lib/email'

const request = {
  schoolName: 'Lycée <Mistral>',
  organizerName: 'Marie <B>',
  organizerEmail: 'marie@lycee.fr',
  note: 'Le <script> nôtre',
  filename: 'dossier<x>.pdf',
  content: 'YmFzZTY0',
}

describe('sendTemplateRequestEmail', () => {
  beforeEach(() => {
    sendMock.mockClear()
    sendMock.mockResolvedValue({ error: null })
    process.env.RESEND_API_KEY = 'test-key'
    process.env.FEEDBACK_EMAIL = 'bjorn@example.com'
  })

  it('attaches the file and escapes every organizer-supplied value', async () => {
    const sent = await sendTemplateRequestEmail(request)
    expect(sent).toBe(true)

    const { to, subject, html, attachments } = sendMock.mock.calls[0][0]
    expect(to).toBe('bjorn@example.com')
    expect(subject).toContain('Demande de modèle')
    expect(attachments).toEqual([{ filename: 'dossier<x>.pdf', content: 'YmFzZTY0' }])
    expect(html).toContain('Lycée &lt;Mistral&gt;')
    expect(html).toContain('Marie &lt;B&gt;')
    expect(html).toContain('dossier&lt;x&gt;.pdf')
    expect(html).toContain('Le &lt;script&gt; nôtre')
    expect(html).not.toContain('<script>')
  })

  it('omits the note block when there is none', async () => {
    await sendTemplateRequestEmail({ ...request, note: null })
    expect(sendMock.mock.calls[0][0].html).toContain('dossier&lt;x&gt;.pdf')
  })

  // The caller turns a false into a visible failure rather than telling the
  // organizer their file was received.
  it('reports false when Resend rejects the send', async () => {
    sendMock.mockResolvedValue({ error: { statusCode: 422 } })
    expect(await sendTemplateRequestEmail(request)).toBe(false)
  })

  it('reports false when FEEDBACK_EMAIL is unset', async () => {
    delete process.env.FEEDBACK_EMAIL
    expect(await sendTemplateRequestEmail(request)).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('reports false when email is disabled entirely (no API key)', async () => {
    delete process.env.RESEND_API_KEY
    expect(await sendTemplateRequestEmail(request)).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })
})
