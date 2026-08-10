import { describe, it, expect } from 'vitest'
import { isRedirectRejection } from '@/lib/next-redirect'

// The exact shape Next hands the browser: getRedirectError() builds an Error
// whose message is 'NEXT_REDIRECT' and whose digest carries the destination.
function redirectRejection(url = '/applications', type = 'push', status = 307) {
  const err = new Error('NEXT_REDIRECT') as Error & { digest?: string }
  err.digest = `NEXT_REDIRECT;${type};${url};${status};`
  return err
}

describe('isRedirectRejection', () => {
  it('recognises the rejection Next uses to signal a successful redirect', () => {
    expect(isRedirectRejection(redirectRejection())).toBe(true)
  })

  it('recognises a replace redirect and a permanent one', () => {
    expect(isRedirectRejection(redirectRejection('/login', 'replace'))).toBe(true)
    expect(isRedirectRejection(redirectRejection('/login', 'replace', 308))).toBe(true)
  })

  it('does not swallow a genuine failure', () => {
    expect(isRedirectRejection(new Error('boom'))).toBe(false)
    expect(isRedirectRejection(new TypeError('Failed to fetch'))).toBe(false)
  })

  // notFound() is control flow too, but it is NOT a successful submit — the
  // caller must still surface it. Only redirects mean "we are navigating away".
  it('does not match the other Next control-flow digests', () => {
    for (const digest of ['NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404']) {
      const err = new Error('x') as Error & { digest?: string }
      err.digest = digest
      expect(isRedirectRejection(err)).toBe(false)
    }
  })

  it('is not fooled by a digest that merely starts with the same letters', () => {
    const err = new Error('x') as Error & { digest?: string }
    err.digest = 'NEXT_REDIRECTION_FAILED'
    expect(isRedirectRejection(err)).toBe(false)
  })

  it('survives non-Error rejections without throwing', () => {
    expect(isRedirectRejection(null)).toBe(false)
    expect(isRedirectRejection(undefined)).toBe(false)
    expect(isRedirectRejection('NEXT_REDIRECT')).toBe(false)
    expect(isRedirectRejection({ digest: 42 })).toBe(false)
  })
})
