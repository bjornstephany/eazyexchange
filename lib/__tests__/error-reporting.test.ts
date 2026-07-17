import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpcMock = vi.fn(async (_fn: string, _args: unknown) => ({ error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: (fn: string, args: unknown) => rpcMock(fn, args) }),
}))

import {
  normalizeMessage, redactEmails, truncate, errorFingerprint,
  MESSAGE_MAX, STACK_MAX, reportServerError,
} from '../error-reporting'

describe('normalizeMessage', () => {
  it('replaces UUIDs with a placeholder', () => {
    expect(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'))
      .toBe('Exchange <uuid> not found')
  })

  it('replaces long digit runs (4+) with a placeholder', () => {
    expect(normalizeMessage('row 123456 failed after 2026 ms')).toBe('row <n> failed after <n> ms')
  })

  it('keeps short numbers so HTTP 404 and HTTP 500 stay distinct bugs', () => {
    expect(normalizeMessage('Request failed with status 500'))
      .toBe('Request failed with status 500')
  })

  it('handles several ids in one message', () => {
    const a = normalizeMessage('link 0f8fad5b-d9cb-469f-a165-70867728950e to 7c9e6679-7425-40de-944b-e07fc1f90ae7')
    expect(a).toBe('link <uuid> to <uuid>')
  })
})

describe('errorFingerprint', () => {
  it('is stable across messages differing only by ids', () => {
    const a = errorFingerprint(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), '/exchanges/[id]')
    const b = errorFingerprint(normalizeMessage('Exchange 7c9e6679-7425-40de-944b-e07fc1f90ae7 not found'), '/exchanges/[id]')
    expect(a).toBe(b)
  })

  it('differs across routes for the same message', () => {
    expect(errorFingerprint('boom', '/exchanges/[id]'))
      .not.toBe(errorFingerprint('boom', '/billing'))
  })

  it('is a 64-char hex sha256', () => {
    expect(errorFingerprint('boom', '/')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('redactEmails', () => {
  it('redacts email-shaped strings', () => {
    expect(redactEmails('sending to parent.dupont@example.com failed'))
      .toBe('sending to <email> failed')
  })

  it('redacts several emails and leaves the rest intact', () => {
    expect(redactEmails('a@b.fr then c.d@e-f.co: timeout'))
      .toBe('<email> then <email>: timeout')
  })

  it('leaves plain text alone', () => {
    expect(redactEmails('constraint violation on submissions')).toBe('constraint violation on submissions')
  })
})

describe('truncate', () => {
  it('caps at the limit', () => {
    expect(truncate('a'.repeat(3000), MESSAGE_MAX)).toHaveLength(2000)
    expect(truncate('a'.repeat(9000), STACK_MAX)).toHaveLength(8000)
  })

  it('leaves short strings untouched', () => {
    expect(truncate('short', MESSAGE_MAX)).toBe('short')
  })
})

describe('reportServerError', () => {
  const ctx = { routePath: '/exchanges/[id]', method: 'POST' }
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    rpcMock.mockClear()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('records via record_error_report with a normalized fingerprint and the concrete message', async () => {
    const err = Object.assign(new Error('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), { digest: 'dgst123' })
    await reportServerError(err, ctx)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('record_error_report')
    expect(args).toMatchObject({
      p_message: 'Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found',
      p_route_path: '/exchanges/[id]',
      p_method: 'POST',
      p_digest: 'dgst123',
      p_fingerprint: errorFingerprint(normalizeMessage('Exchange 0f8fad5b-d9cb-469f-a165-70867728950e not found'), '/exchanges/[id]'),
    })
    expect(typeof args.p_stack).toBe('string')
  })

  it('skips Next.js control-flow digests (redirect / notFound are not bugs)', async () => {
    for (const digest of ['NEXT_REDIRECT;replace;/login;307;', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404']) {
      await reportServerError(Object.assign(new Error('x'), { digest }), ctx)
    }
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('redacts emails from message and stack before storage', async () => {
    const err = new Error('mail to parent.dupont@example.com bounced')
    err.stack = 'Error: mail to parent.dupont@example.com bounced\n    at sendMail'
    await reportServerError(err, ctx)
    const [, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(args.p_message).toBe('mail to <email> bounced')
    expect(args.p_stack).not.toContain('parent.dupont@example.com')
  })

  it('truncates message to 2000 and stack to 8000 chars', async () => {
    const err = new Error('m'.repeat(5000))
    err.stack = 's'.repeat(20000)
    await reportServerError(err, ctx)
    const [, args] = rpcMock.mock.calls[0] as [string, { p_message: string; p_stack: string }]
    expect(args.p_message).toHaveLength(MESSAGE_MAX)
    expect(args.p_stack).toHaveLength(STACK_MAX)
  })

  it('handles non-Error throwables: message from String(), no stack, no digest', async () => {
    await reportServerError('plain string failure', ctx)
    const [, args] = rpcMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(args.p_message).toBe('plain string failure')
    expect(args.p_stack).toBeUndefined()
    expect(args.p_digest).toBeUndefined()
  })

  it('resolves and logs only an error code when the RPC returns an error', async () => {
    rpcMock.mockResolvedValueOnce({ error: { code: '42501' } })
    await expect(reportServerError(new Error('secret contents'), ctx)).resolves.toBeUndefined()
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('42501')
    expect(logged).not.toContain('secret contents')
  })

  it('resolves even when the admin client throws (never-throw contract)', async () => {
    rpcMock.mockRejectedValueOnce(new Error('network down'))
    await expect(reportServerError(new Error('boom'), ctx)).resolves.toBeUndefined()
  })
})
