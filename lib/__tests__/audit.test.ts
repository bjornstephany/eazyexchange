import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn(async (_table: string, _row: unknown) => ({ error: null as { code?: string } | null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({ insert: (row: unknown) => insertMock(table, row) }),
  }),
}))

import { logAudit } from '../audit'

describe('logAudit', () => {
  beforeEach(() => insertMock.mockClear())

  it('inserts an audit_log row carrying ids and action only', async () => {
    await logAudit({
      action: 'submission.approved',
      actorUserId: 'org-1',
      actorSchoolId: 'school-1',
      targetType: 'submission',
      targetId: 'sub-1',
      metadata: { assignment_id: 'a-1' },
    })
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith('audit_log', {
      action: 'submission.approved',
      actor_user_id: 'org-1',
      actor_school_id: 'school-1',
      target_type: 'submission',
      target_id: 'sub-1',
      metadata: { assignment_id: 'a-1' },
    })
  })

  it('defaults metadata to {} ', async () => {
    await logAudit({
      action: 'exchange.archived', actorUserId: 'org-1', actorSchoolId: 'school-1',
      targetType: 'exchange', targetId: 'ex-1',
    })
    expect(insertMock.mock.calls[0][1]).toMatchObject({ metadata: {} })
  })

  it('swallows insert errors — an audit failure must never break the action', async () => {
    insertMock.mockResolvedValueOnce({ error: { code: '42501' } })
    await expect(
      logAudit({
        action: 'submission.rejected', actorUserId: 'org-1', actorSchoolId: 'school-1',
        targetType: 'submission', targetId: 'sub-1',
      }),
    ).resolves.toBeUndefined()
  })

  it('swallows thrown errors too', async () => {
    insertMock.mockRejectedValueOnce(new Error('network down'))
    await expect(
      logAudit({
        action: 'organizer.removed', actorUserId: 'org-1', actorSchoolId: 'school-1',
        targetType: 'user', targetId: 'u-2',
      }),
    ).resolves.toBeUndefined()
  })
})
