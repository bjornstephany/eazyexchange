import { describe, it, expect, vi, beforeEach } from 'vitest'

let profile: any
let insertError: unknown
let calls: { inserted: any; fromTables: string[] }

function makeClient() {
  calls = { inserted: null, fromTables: [] }
  return {
    from(table: string) {
      calls.fromTables.push(table)
      if (table === 'feedback') {
        return { insert: async (row: any) => { calls.inserted = row; return { error: insertError ?? null } } }
      }
      throw new Error('unexpected table ' + table)
    },
  }
}

const getProfile = vi.fn(async () => profile)
const sendFeedbackNotificationEmail = vi.fn(async (input: any) => {})

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }))
vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
vi.mock('@/lib/email', () => ({
  sendFeedbackNotificationEmail: (input: any) => sendFeedbackNotificationEmail(input),
}))

import { submitFeedback } from '../feedback'

const organizer = {
  id: 'u1', role: 'organizer', school_id: 's1', full_name: 'Marie Bernard',
  schools: { name: 'Lycée Mistral' },
}

beforeEach(() => {
  profile = organizer
  insertError = null
  calls = { inserted: null, fromTables: [] }
  getProfile.mockClear()
  sendFeedbackNotificationEmail.mockClear()
})

describe('submitFeedback', () => {
  it('rejects a non-organizer without inserting', async () => {
    profile = { ...organizer, role: 'student' }
    const result = await submitFeedback({ type: 'bug', message: 'x', pagePath: '/my-forms' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects when there is no profile', async () => {
    profile = null
    const result = await submitFeedback({ type: 'bug', message: 'x' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects an invalid type', async () => {
    const result = await submitFeedback({ type: 'praise', message: 'x' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects an empty (whitespace-only) message', async () => {
    const result = await submitFeedback({ type: 'suggestion', message: '   ' })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('rejects a message longer than 2000 chars', async () => {
    const result = await submitFeedback({ type: 'suggestion', message: 'a'.repeat(2001) })
    expect(result.ok).toBe(false)
    expect(calls.inserted).toBeNull()
  })

  it('inserts the expected payload (trimmed message, ids from profile) and returns ok', async () => {
    const result = await submitFeedback({ type: 'bug', message: '  broken button  ', pagePath: '/dashboard' })
    expect(result).toEqual({ ok: true })
    expect(calls.inserted).toEqual({
      user_id: 'u1',
      school_id: 's1',
      type: 'bug',
      message: 'broken button',
      page_path: '/dashboard',
    })
    expect(sendFeedbackNotificationEmail).toHaveBeenCalledTimes(1)
  })

  it('truncates an over-long pagePath to 300 chars', async () => {
    await submitFeedback({ type: 'bug', message: 'x', pagePath: '/' + 'a'.repeat(500) })
    expect(calls.inserted.page_path).toHaveLength(300)
  })

  it('coerces a missing pagePath to null', async () => {
    await submitFeedback({ type: 'suggestion', message: 'x' })
    expect(calls.inserted.page_path).toBeNull()
  })

  it('still returns ok when the notification email throws', async () => {
    sendFeedbackNotificationEmail.mockRejectedValueOnce(new Error('resend down'))
    const result = await submitFeedback({ type: 'suggestion', message: 'idea' })
    expect(result).toEqual({ ok: true })
    expect(calls.inserted).not.toBeNull()
  })

  it('returns an error (never throws) when the insert fails', async () => {
    insertError = { message: 'db down' }
    const result = await submitFeedback({ type: 'bug', message: 'x' })
    expect(result.ok).toBe(false)
  })
})
