import { describe, it, expect, vi, beforeEach } from 'vitest'

const update = vi.fn()
const eq = vi.fn()
const requireOrganizer = vi.fn()

vi.mock('@/lib/auth/require', () => ({
  requireOrganizer: (...args: unknown[]) => requireOrganizer(...args),
  requireUser: vi.fn(),
  requireStudent: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ update }) }),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markNotificationsSeen } from '@/actions/session'
import { revalidatePath } from 'next/cache'

describe('markNotificationsSeen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrganizer.mockResolvedValue({ user: { id: 'user-1' }, profile: { role: 'organizer' } })
    update.mockReturnValue({ eq })
    eq.mockResolvedValue({ error: null })
  })

  it('stamps the caller’s own row and reports success', async () => {
    await expect(markNotificationsSeen()).resolves.toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ notifications_seen_at: expect.any(String) }),
    )
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns a structured failure instead of throwing when the write fails', async () => {
    eq.mockResolvedValue({ error: { message: 'nope' } })
    await expect(markNotificationsSeen()).resolves.toEqual({ ok: false, reason: 'write_failed' })
  })

  it('does not revalidate — that would re-render the shell under the open panel', async () => {
    await markNotificationsSeen()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('propagates the auth preamble’s rejection', async () => {
    requireOrganizer.mockRejectedValue(new Error('Unauthorized'))
    await expect(markNotificationsSeen()).rejects.toThrow('Unauthorized')
  })
})
