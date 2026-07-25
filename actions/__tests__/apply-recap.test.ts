import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendApplicationResumeEmail: vi.fn(),
  sendApplicationConfirmationEmail: vi.fn(),
  sendNewApplicationAlertEmail: vi.fn(),
}))
vi.mock('@/lib/exchange-guard', () => ({ assertExchangeWritable: vi.fn(async () => {}) }))
const checkRateLimit = vi.fn(async () => 'allowed' as 'allowed' | 'limited' | 'error')
vi.mock('@/lib/rate-limit', () => ({
  clientIp: async () => '1.2.3.4',
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...(a as [])),
}))
// The real renderer is exercised by lib/pdf/__tests__/application-recap.test.ts;
// here it is stubbed so the action's control flow is what's under test.
const renderApplicationRecapPdf = vi.fn(async (_input?: unknown) => Buffer.from('%PDF-fake'))
vi.mock('@/lib/pdf/application-recap', () => ({
  renderApplicationRecapPdf: (input: unknown) => renderApplicationRecapPdf(input as never),
}))

let appRow: any
const download = vi.fn(async () => ({
  data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
  error: null,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: appRow, error: null }) }) }),
    }),
    storage: { from: () => ({ download }) },
  }),
}))

import { downloadApplicationRecap } from '../apply'

const FUTURE = new Date(Date.now() + 1e9).toISOString()
const PAST = new Date(Date.now() - 1e9).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue('allowed')
  renderApplicationRecapPdf.mockResolvedValue(Buffer.from('%PDF-fake'))
  download.mockResolvedValue({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    error: null,
  } as any)
  appRow = {
    status: 'submitted',
    data: { first_name: 'Zoé', last_name: 'Dupont-Léger' },
    language: 'fr',
    photo_path: null,
    submitted_at: '2026-07-19T10:00:00Z',
    resume_token_expires_at: FUTURE,
    exchanges: { name: 'France-Minnesota 2026' },
  }
})

describe('downloadApplicationRecap', () => {
  it('returns not_found for an unknown token', async () => {
    appRow = null
    expect(await downloadApplicationRecap('nope')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('returns expired once the resume token has lapsed', async () => {
    appRow.resume_token_expires_at = PAST
    expect(await downloadApplicationRecap('tok')).toEqual({ ok: false, reason: 'expired' })
  })

  it.each(['draft', 'invited'])('returns not_submitted for a %s application', async (status) => {
    appRow.status = status
    expect(await downloadApplicationRecap('tok')).toEqual({ ok: false, reason: 'not_submitted' })
  })

  it('returns base64 PDF bytes and an ASCII-folded filename on the happy path', async () => {
    const res = await downloadApplicationRecap('tok')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(Buffer.from(res.pdf, 'base64').toString()).toBe('%PDF-fake')
    expect(res.filename).toBe('candidature-zoe-dupont-leger.pdf')
  })

  it('rate-limits by client IP before touching the database', async () => {
    await downloadApplicationRecap('tok')
    expect(checkRateLimit).toHaveBeenCalledWith('recap_ip:1.2.3.4', 20, 3600)
  })

  // Was a throw, so prod showed the applicant an opaque digest.
  it('returns rate_limited as a value instead of throwing', async () => {
    checkRateLimit.mockResolvedValue('limited')
    expect(await downloadApplicationRecap('tok')).toEqual({ ok: false, reason: 'rate_limited' })
    expect(renderApplicationRecapPdf).not.toHaveBeenCalled()
  })

  it('fails OPEN when the rate-limit check itself errors', async () => {
    checkRateLimit.mockResolvedValue('error')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await downloadApplicationRecap('tok')
    expect(res.ok).toBe(true)
    spy.mockRestore()
  })

  it('passes the row through to the renderer, honoring the stored locale', async () => {
    // 'de' is a supported locale since the CHECK was widened — it survives now.
    appRow.language = 'de'
    await downloadApplicationRecap('tok')
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({
      exchangeName: 'France-Minnesota 2026',
      applicantName: 'Zoé Dupont-Léger',
      submittedAt: '2026-07-19T10:00:00Z',
      locale: 'de',
      photoBytes: null,
    }))
  })

  it('normalizes an unsupported stored language to the default locale', async () => {
    appRow.language = 'pt'
    await downloadApplicationRecap('tok')
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
  })

  it('downloads the photo when photo_path is set and forwards the bytes', async () => {
    appRow.photo_path = 'app-1/photo.png'
    await downloadApplicationRecap('tok')
    expect(download).toHaveBeenCalledWith('app-1/photo.png')
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({
      photoBytes: new Uint8Array([1, 2, 3]),
    }))
  })

  it('still returns ok when the photo download fails', async () => {
    appRow.photo_path = 'app-1/photo.png'
    download.mockResolvedValue({ data: null, error: { message: 'gone' } } as any)
    const res = await downloadApplicationRecap('tok')
    expect(res.ok).toBe(true)
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({ photoBytes: null }))
  })

  it('drops an oversized photo before rendering but still returns ok', async () => {
    appRow.photo_path = 'app-1/photo.png'
    const oversized = new Uint8Array(2_000_001)
    download.mockResolvedValue({
      data: { arrayBuffer: async () => oversized.buffer },
      error: null,
    } as any)
    const res = await downloadApplicationRecap('tok')
    expect(res.ok).toBe(true)
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({ photoBytes: null }))
  })

  it('falls back to a bare filename when the name is missing', async () => {
    appRow.data = {}
    const res = await downloadApplicationRecap('tok')
    expect(res.ok && res.filename).toBe('candidature.pdf')
  })

  it("honors the caller's explicit language over the row's language", async () => {
    appRow.language = 'fr'
    await downloadApplicationRecap('tok', 'en')
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }))
  })

  it('falls back to the DB-derived language when the caller value is invalid', async () => {
    appRow.language = 'fr'
    await downloadApplicationRecap('tok', 'pt' as never)
    expect(renderApplicationRecapPdf).toHaveBeenCalledWith(expect.objectContaining({ locale: 'fr' }))
  })
})
