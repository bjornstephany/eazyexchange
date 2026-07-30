import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isBadJwtError,
  withAuthAdminRetry,
  AUTH_ADMIN_ATTEMPTS,
  type AdminError,
} from '../admin-retry'

type AdminResult = { data: { id: string } | null; error: AdminError }

const badJwt = { code: 'bad_jwt', status: 403, message: 'bad_jwt' }
// What the prod auth log actually returned, per docs/security/supabase-secret-key-bad-jwt.md
const badJwtVerbose = {
  status: 403,
  message: 'error while executing keyfunc: unrecognized JWT kid <nil> for algorithm ES256',
}
// The OTHER 403: Cloudflare's block after ~300 rapid requests, HTML not JSON.
const cloudflare403 = { status: 403, message: 'Sorry, you have been blocked' }
const emailExists = { code: 'email_exists', status: 422, message: 'Email already registered' }

afterEach(() => vi.restoreAllMocks())

describe('isBadJwtError', () => {
  it('matches the bad_jwt code', () => {
    expect(isBadJwtError(badJwt)).toBe(true)
  })

  it('matches the verbose keyfunc message when no code is surfaced', () => {
    expect(isBadJwtError(badJwtVerbose)).toBe(true)
  })

  it('does NOT match Cloudflare’s 403 block', () => {
    // Retrying into a Cloudflare block deepens it. Status alone must never be
    // the discriminator.
    expect(isBadJwtError(cloudflare403)).toBe(false)
  })

  it('does NOT match a legitimate business error', () => {
    expect(isBadJwtError(emailExists)).toBe(false)
  })

  it('tolerates null, undefined and non-objects', () => {
    expect(isBadJwtError(null)).toBe(false)
    expect(isBadJwtError(undefined)).toBe(false)
    expect(isBadJwtError('bad_jwt')).toBe(false)
  })
})

describe('withAuthAdminRetry', () => {
  it('calls once and returns when there is no error', async () => {
    const op = vi.fn().mockResolvedValue({ data: { id: 'u1' }, error: null })
    const result = await withAuthAdminRetry(op, 'createUser')
    expect(op).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ data: { id: 'u1' }, error: null })
  })

  it('does NOT retry a non-bad_jwt error', async () => {
    // email_exists is an answer, not a failure — retrying delays a correct result.
    const op = vi.fn().mockResolvedValue({ data: null, error: emailExists })
    const result = await withAuthAdminRetry(op, 'createUser')
    expect(op).toHaveBeenCalledTimes(1)
    expect(result.error).toBe(emailExists)
  })

  it('does NOT retry a Cloudflare 403', async () => {
    const op = vi.fn().mockResolvedValue({ data: null, error: cloudflare403 })
    await withAuthAdminRetry(op, 'deleteUser')
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries bad_jwt and returns the first success', async () => {
    const op = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: badJwt })
      .mockResolvedValueOnce({ data: { id: 'u1' }, error: null })
    const result = await withAuthAdminRetry<AdminResult>(op, 'generateLink')
    expect(op).toHaveBeenCalledTimes(2)
    expect(result.error).toBeNull()
    expect(result.data).toEqual({ id: 'u1' })
  })

  it('recovers on the final permitted attempt', async () => {
    const op = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: badJwt })
      .mockResolvedValueOnce({ data: null, error: badJwtVerbose })
      .mockResolvedValueOnce({ data: { id: 'u1' }, error: null })
    const result = await withAuthAdminRetry(op, 'createUser')
    expect(op).toHaveBeenCalledTimes(AUTH_ADMIN_ATTEMPTS)
    expect(result.error).toBeNull()
  })

  it('gives up after the attempt budget, returning the last result and warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const op = vi.fn().mockResolvedValue({ data: null, error: badJwt })
    const result = await withAuthAdminRetry(op, 'deleteUser')
    expect(op).toHaveBeenCalledTimes(AUTH_ADMIN_ATTEMPTS)
    // The caller's own error handling still runs — the shape is unchanged.
    expect(result.error).toBe(badJwt)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('deleteUser')
  })

  it('does not warn when a retry eventually succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const op = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: badJwt })
      .mockResolvedValueOnce({ data: null, error: null })
    await withAuthAdminRetry(op, 'createUser')
    expect(warn).not.toHaveBeenCalled()
  })

  it('never logs the label’s caller data — labels are the only interpolation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const op = vi.fn().mockResolvedValue({ data: null, error: badJwt })
    await withAuthAdminRetry(op, 'settings.removeCollaborator')
    const logged = String(warn.mock.calls[0][0])
    expect(logged).not.toMatch(/@/) // no email ever reaches these logs
  })
})
