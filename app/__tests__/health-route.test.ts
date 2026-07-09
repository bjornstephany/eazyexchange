import { describe, it, expect } from 'vitest'
import { GET, dynamic } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 { ok: true }', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('opts out of static optimization so each ping reaches the function', () => {
    // Without force-dynamic Next serves a cached static body from the CDN and
    // the keep-warm ping never touches the function.
    expect(dynamic).toBe('force-dynamic')
  })
})
