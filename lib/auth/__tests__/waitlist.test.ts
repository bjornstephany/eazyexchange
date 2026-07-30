import { describe, it, expect, vi, beforeEach } from 'vitest'

type UpsertRow = { email: string; full_name: string | null; source: string }
type UpsertOpts = { onConflict?: string; ignoreDuplicates?: boolean }

let allowlistRow: { email: string } | null = null
let allowlistError: { message: string } | null = null
let insertedRows: UpsertRow[] = []
let upsertReturns: UpsertRow[] = []
let upsertError: { message: string } | null = null
const upsertOpts: UpsertOpts[] = []
const allowlistQueries: string[] = []

const admin = {
  from: (table: string) => {
    if (table === 'signup_allowlist') {
      return {
        select: () => ({
          eq: (_col: string, value: string) => {
            allowlistQueries.push(value)
            return { maybeSingle: async () => ({ data: allowlistRow, error: allowlistError }) }
          },
        }),
      }
    }
    if (table === 'signup_waitlist') {
      return {
        upsert: (row: UpsertRow, opts: UpsertOpts) => {
          insertedRows.push(row)
          upsertOpts.push(opts)
          return { select: async () => ({ data: upsertReturns, error: upsertError }) }
        },
      }
    }
    throw new Error(`unexpected table ${table}`)
  },
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

const sendWaitlistNotificationEmail = vi.fn(async (_o: Record<string, unknown>) => {})
vi.mock('@/lib/email', () => ({
  sendWaitlistNotificationEmail: (o: Record<string, unknown>) => sendWaitlistNotificationEmail(o),
}))

import { isSignupAllowlisted, recordWaitlistEntry } from '@/lib/auth/waitlist'

beforeEach(() => {
  allowlistRow = null
  allowlistError = null
  insertedRows = []
  upsertReturns = []
  upsertError = null
  upsertOpts.length = 0
  allowlistQueries.length = 0
  sendWaitlistNotificationEmail.mockClear()
})

describe('isSignupAllowlisted', () => {
  it('is true when the address has a row', async () => {
    allowlistRow = { email: 'owner@example.com' }
    expect(await isSignupAllowlisted('owner@example.com')).toBe(true)
    expect(allowlistQueries).toEqual(['owner@example.com'])
  })

  it('is false when it does not', async () => {
    expect(await isSignupAllowlisted('stranger@example.com')).toBe(false)
  })

  // Fails CLOSED: a transient DB error must never mint an account. The visitor
  // sees the waitlist message, which is recoverable; a wrongly-created account
  // is the thing this whole design exists to prevent.
  it('is false when the lookup errors', async () => {
    allowlistError = { message: 'connection reset' }
    allowlistRow = { email: 'owner@example.com' }
    expect(await isSignupAllowlisted('owner@example.com')).toBe(false)
  })
})

describe('recordWaitlistEntry', () => {
  it('inserts on conflict-do-nothing and notifies the owner', async () => {
    upsertReturns = [{ email: 'a@b.fr', full_name: 'A B', source: 'password' }]
    await recordWaitlistEntry({ email: 'a@b.fr', fullName: 'A B', source: 'password' })
    expect(insertedRows).toEqual([{ email: 'a@b.fr', full_name: 'A B', source: 'password' }])
    expect(upsertOpts[0]).toEqual({ onConflict: 'email', ignoreDuplicates: true })
    expect(sendWaitlistNotificationEmail).toHaveBeenCalledWith({
      fullName: 'A B', email: 'a@b.fr', source: 'password',
    })
  })

  it('records a Google entry with its display name', async () => {
    upsertReturns = [{ email: 'g@x.fr', full_name: 'G User', source: 'google' }]
    await recordWaitlistEntry({ email: 'g@x.fr', fullName: 'G User', source: 'google' })
    expect(insertedRows[0]).toEqual({ email: 'g@x.fr', full_name: 'G User', source: 'google' })
  })

  // Signing up twice is idempotent and shows the same message both times; the
  // original created_at is preserved and the owner is not re-alerted.
  it('does not re-notify on a duplicate', async () => {
    upsertReturns = []
    await recordWaitlistEntry({ email: 'a@b.fr', fullName: 'A B', source: 'password' })
    expect(insertedRows).toHaveLength(1)
    expect(sendWaitlistNotificationEmail).not.toHaveBeenCalled()
  })

  it('does not notify when the insert failed', async () => {
    upsertError = { message: 'boom' }
    await recordWaitlistEntry({ email: 'a@b.fr', fullName: null, source: 'password' })
    expect(sendWaitlistNotificationEmail).not.toHaveBeenCalled()
  })

  it('never throws — the caller has already decided what to show', async () => {
    upsertError = { message: 'boom' }
    await expect(
      recordWaitlistEntry({ email: 'a@b.fr', fullName: null, source: 'password' }),
    ).resolves.toBeUndefined()
  })
})
