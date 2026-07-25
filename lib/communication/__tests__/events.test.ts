import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordCommunicationEvent } from '@/lib/communication/events'

let inserted: Record<string, unknown>[] = []
let insertResult: { error: { code?: string } | null } = { error: null }

function makeClient() {
  return {
    from(table: string) {
      expect(table).toBe('communication_events')
      return {
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row)
          return insertResult
        },
      }
    },
  } as never
}

beforeEach(() => {
  inserted = []
  insertResult = { error: null }
})

describe('recordCommunicationEvent', () => {
  it('maps the camelCase input onto the snake_case row', async () => {
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1',
      actorId: 'user-1',
      kind: 'info_published',
      subject: 'Point de rendez-vous',
    })
    expect(inserted).toEqual([{
      exchange_id: 'ex-1',
      actor_id: 'user-1',
      application_id: null,
      kind: 'info_published',
      subject: 'Point de rendez-vous',
      status: 'ok',
    }])
  })

  it('carries application_id and a failed status through', async () => {
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1',
      actorId: 'user-1',
      applicationId: 'app-1',
      kind: 'good_news_sent',
      subject: 'Marie Dupont',
      status: 'failed',
    })
    expect(inserted[0]).toMatchObject({ application_id: 'app-1', status: 'failed' })
  })

  it('truncates an over-long subject rather than letting the insert fail', async () => {
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1', actorId: null, kind: 'info_updated', subject: 'x'.repeat(500),
    })
    expect((inserted[0].subject as string).length).toBe(200)
  })

  // Best-effort, exactly like logEmailSend: a history hiccup must never roll
  // back the real action the organizer performed.
  it('never throws when the insert returns an error', async () => {
    insertResult = { error: { code: '42501' } }
    await expect(recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1', actorId: null, kind: 'info_deleted', subject: 'T',
    })).resolves.toBeUndefined()
  })

  it('never throws when the client itself blows up', async () => {
    const broken = { from() { throw new Error('boom') } } as never
    await expect(recordCommunicationEvent(broken, {
      exchangeId: 'ex-1', actorId: null, kind: 'info_deleted', subject: 'T',
    })).resolves.toBeUndefined()
  })

  it('logs no PII when the write fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    insertResult = { error: { code: '42501' } }
    await recordCommunicationEvent(makeClient(), {
      exchangeId: 'ex-1', actorId: null, kind: 'good_news_sent', subject: 'Marie Dupont',
    })
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('Marie Dupont')
    spy.mockRestore()
  })
})
