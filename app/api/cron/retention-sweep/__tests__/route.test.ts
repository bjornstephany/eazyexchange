// app/api/cron/retention-sweep/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runRetentionSweep = vi.fn(async () => ({ rateLimits: 2 }))
const logAudit = vi.fn(async () => {})
vi.mock('@/lib/retention/sweep', () => ({ runRetentionSweep }))
vi.mock('@/lib/audit', () => ({ logAudit }))

beforeEach(() => { vi.clearAllMocks(); process.env.CRON_SECRET = 's3cret'; delete process.env.RETENTION_ENFORCE })

function req(secret?: string) {
  return new Request('http://x/api/cron/retention-sweep', {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  })
}

describe('POST /api/cron/retention-sweep', () => {
  it('401s without the secret', async () => {
    const { POST } = await import('../route')
    const res = await POST(req() as any)
    expect(res.status).toBe(401)
    expect(runRetentionSweep).not.toHaveBeenCalled()
  })

  it('runs log-only by default and audits', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('s3cret') as any)
    expect(res.status).toBe(200)
    expect(runRetentionSweep).toHaveBeenCalledWith(expect.any(Date), 'log-only')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'retention.sweep' }))
  })

  it('runs enforce when RETENTION_ENFORCE=1', async () => {
    process.env.RETENTION_ENFORCE = '1'
    const { POST } = await import('../route')
    await POST(req('s3cret') as any)
    expect(runRetentionSweep).toHaveBeenCalledWith(expect.any(Date), 'enforce')
  })
})
