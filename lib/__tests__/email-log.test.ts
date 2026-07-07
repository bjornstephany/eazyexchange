import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertMock = vi.fn().mockResolvedValue({ error: null })
const fromMock = vi.fn(() => ({ insert: insertMock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }))

import { logEmailSend } from '@/lib/email-log'

describe('logEmailSend', () => {
  beforeEach(() => {
    insertMock.mockClear()
    fromMock.mockClear()
    insertMock.mockResolvedValue({ error: null })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://staging.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sk-test'
  })
  afterEach(() => {
    // Don't leak env into other test files in the same worker.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('inserts a row with snake_case columns and null defaults', async () => {
    await logEmailSend({ recipient: 'parent@example.com', kind: 'invitation email', status: 'sent' })
    expect(fromMock).toHaveBeenCalledWith('email_send_log')
    expect(insertMock).toHaveBeenCalledWith({
      recipient: 'parent@example.com',
      kind: 'invitation email',
      status: 'sent',
      error_code: null,
      school_id: null,
      exchange_id: null,
    })
  })

  it('passes context ids and error code through', async () => {
    await logEmailSend({
      recipient: 'parent@example.com', kind: 'student reminder email', status: 'error',
      errorCode: 429, schoolId: 'school-1', exchangeId: 'exchange-1',
    })
    expect(insertMock).toHaveBeenCalledWith({
      recipient: 'parent@example.com',
      kind: 'student reminder email',
      status: 'error',
      error_code: 429,
      school_id: 'school-1',
      exchange_id: 'exchange-1',
    })
  })

  it('never throws when the insert fails', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '42P01', message: 'relation missing' } })
    await expect(
      logEmailSend({ recipient: 'p@example.com', kind: 'x', status: 'sent' }),
    ).resolves.toBeUndefined()
  })

  it('skips silently when Supabase env is missing (local dev / most tests)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    await logEmailSend({ recipient: 'p@example.com', kind: 'x', status: 'sent' })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
