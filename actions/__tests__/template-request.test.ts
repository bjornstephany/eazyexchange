import { describe, it, expect, vi, beforeEach } from 'vitest'

let profile: any
let user: any
let rate: 'allowed' | 'limited' | 'error'
let sendResult: boolean | Error
let insertError: unknown
let calls: { inserted: any }

function makeClient() {
  return {
    from(table: string) {
      if (table === 'feedback') {
        return { insert: async (row: any) => { calls.inserted = row; return { error: insertError ?? null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

const requireOrganizer = vi.fn(async () => {
  if (!profile || profile.role !== 'organizer') throw new Error('Unauthorized')
  return { user, profile }
})
const checkRateLimit = vi.fn(async () => rate)
const sendTemplateRequestEmail = vi.fn(async (_input: any) => {
  if (sendResult instanceof Error) throw sendResult
  return sendResult
})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/auth/require', () => ({ requireOrganizer: () => requireOrganizer() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...(a as [])) }))
vi.mock('@/lib/email', () => ({
  sendTemplateRequestEmail: (input: any) => sendTemplateRequestEmail(input),
}))

import { submitTemplateRequest } from '../template-request'
import { TEMPLATE_REQUEST_MAX_BYTES } from '@/lib/template-request'

const organizer = {
  id: 'u1', role: 'organizer', school_id: 's1', full_name: 'Marie Bernard',
  schools: { name: 'Lycée Mistral' },
}

function pdf(name = 'dossier.pdf', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

function body(file: File | null, note?: string): FormData {
  const fd = new FormData()
  if (file) fd.set('file', file)
  if (note !== undefined) fd.set('note', note)
  return fd
}

beforeEach(() => {
  profile = organizer
  user = { id: 'u1', email: 'marie@lycee.fr' }
  rate = 'allowed'
  sendResult = true
  insertError = null
  calls = { inserted: null }
  vi.clearAllMocks()
})

describe('submitTemplateRequest', () => {
  it('refuses a non-organizer before sending anything', async () => {
    profile = { ...organizer, role: 'student' }
    await expect(submitTemplateRequest(body(pdf()))).rejects.toThrow('Unauthorized')
    expect(sendTemplateRequestEmail).not.toHaveBeenCalled()
    expect(calls.inserted).toBeNull()
  })

  it('sends the file and records a trace row', async () => {
    const result = await submitTemplateRequest(body(pdf('Dossier 2026.pdf'), 'On a le nôtre depuis 10 ans'))
    expect(result).toEqual({ ok: true })

    const mail = sendTemplateRequestEmail.mock.calls[0][0]
    expect(mail.filename).toBe('Dossier 2026.pdf')
    expect(mail.schoolName).toBe('Lycée Mistral')
    expect(mail.organizerEmail).toBe('marie@lycee.fr')
    expect(mail.note).toBe('On a le nôtre depuis 10 ans')
    // base64 of the attachment, never a Buffer or a path.
    expect(typeof mail.content).toBe('string')

    expect(calls.inserted).toMatchObject({
      user_id: 'u1', school_id: 's1', type: 'template_request',
    })
    expect(calls.inserted.message).toContain('Dossier 2026.pdf')
  })

  // The mail IS the delivery — there is no bucket and no stored object, so a
  // failed send must never read as « bien reçu ».
  it('reports failure when the email does not go out', async () => {
    sendResult = false
    const result = await submitTemplateRequest(body(pdf()))
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(calls.inserted).toBeNull()
  })

  it('reports failure when sending throws', async () => {
    sendResult = new Error('resend exploded')
    const result = await submitTemplateRequest(body(pdf()))
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(calls.inserted).toBeNull()
  })

  // The row is a convenience for triage; the organizer has already been served.
  it('still succeeds when the trace row fails to insert', async () => {
    insertError = { message: 'nope' }
    const result = await submitTemplateRequest(body(pdf()))
    expect(result).toEqual({ ok: true })
  })

  it('refuses a missing file', async () => {
    const result = await submitTemplateRequest(body(null))
    expect(result).toEqual({ ok: false, reason: 'missing_file' })
    expect(sendTemplateRequestEmail).not.toHaveBeenCalled()
  })

  it('re-checks type and size server-side, whatever the dialog allowed', async () => {
    const zip = new File([new Uint8Array(10)], 'x.zip', { type: 'application/zip' })
    expect(await submitTemplateRequest(body(zip))).toEqual({ ok: false, reason: 'unsupported_type' })

    const huge = pdf('big.pdf', TEMPLATE_REQUEST_MAX_BYTES + 1)
    expect(await submitTemplateRequest(body(huge))).toEqual({ ok: false, reason: 'too_large' })

    expect(sendTemplateRequestEmail).not.toHaveBeenCalled()
  })

  it('refuses an over-long note', async () => {
    const result = await submitTemplateRequest(body(pdf(), 'x'.repeat(1001)))
    expect(result).toEqual({ ok: false, reason: 'note_too_long' })
    expect(sendTemplateRequestEmail).not.toHaveBeenCalled()
  })

  // Fails CLOSED: an action that sends mail from our domain must not lose its
  // cap to a DB blip.
  it('refuses when rate limited, and when the limiter itself errors', async () => {
    rate = 'limited'
    expect(await submitTemplateRequest(body(pdf()))).toEqual({ ok: false, reason: 'rate_limited' })
    rate = 'error'
    expect(await submitTemplateRequest(body(pdf()))).toEqual({ ok: false, reason: 'rate_limited' })
    expect(sendTemplateRequestEmail).not.toHaveBeenCalled()
  })

  it('strips a path from the filename before it becomes an attachment', async () => {
    await submitTemplateRequest(body(pdf('../../etc/passwd.pdf')))
    expect(sendTemplateRequestEmail.mock.calls[0][0].filename).toBe('passwd.pdf')
  })
})
