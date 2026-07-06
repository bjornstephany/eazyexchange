import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAppUrl } from '@/lib/app-url'

describe('getAppUrl', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_BRANCH_URL
    delete process.env.VERCEL_URL
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('prefers an explicit NEXT_PUBLIC_APP_URL (production custom domain)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://eazyexchange.com'
    process.env.VERCEL_BRANCH_URL = 'preview.vercel.app'
    expect(getAppUrl()).toBe('https://eazyexchange.com')
  })

  it('falls back to the per-branch Vercel URL on a preview deployment', () => {
    process.env.VERCEL_BRANCH_URL = 'eazyexchange-git-feat-team.vercel.app'
    expect(getAppUrl()).toBe('https://eazyexchange-git-feat-team.vercel.app')
  })

  it('falls back to the per-deployment VERCEL_URL when no branch URL is set', () => {
    process.env.VERCEL_URL = 'eazyexchange-abc123.vercel.app'
    expect(getAppUrl()).toBe('https://eazyexchange-abc123.vercel.app')
  })

  it('falls back to localhost in local dev (no Vercel vars)', () => {
    expect(getAppUrl()).toBe('http://localhost:3000')
  })
})
