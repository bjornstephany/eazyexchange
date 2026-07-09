import { describe, it, expect, vi, beforeEach } from 'vitest'

let user: { id: string } | null
let profile: { role: string; org_role: string | null } | null

vi.mock('@/lib/supabase/request', () => ({
  getAuthUser: async () => user,
  getProfile: async () => profile,
}))

import { requireUser, requireOrganizer, requireStudent } from '../require'

beforeEach(() => {
  user = { id: 'u1' }
  profile = { role: 'organizer', org_role: 'owner' }
})

describe('requireUser', () => {
  it('throws Unauthenticated when there is no user', async () => {
    user = null
    await expect(requireUser()).rejects.toThrow('Unauthenticated')
  })
  it('returns the user', async () => {
    await expect(requireUser()).resolves.toEqual({ id: 'u1' })
  })
})

describe('requireOrganizer', () => {
  it('throws Unauthenticated before any profile check', async () => {
    user = null
    profile = null
    await expect(requireOrganizer()).rejects.toThrow('Unauthenticated')
  })
  it('throws Unauthorized when the profile is missing', async () => {
    profile = null
    await expect(requireOrganizer()).rejects.toThrow('Unauthorized')
  })
  it('throws Unauthorized for a student', async () => {
    profile = { role: 'student', org_role: null }
    await expect(requireOrganizer()).rejects.toThrow('Unauthorized')
  })
  it('returns user and profile for an organizer', async () => {
    const ctx = await requireOrganizer()
    expect(ctx.user.id).toBe('u1')
    expect(ctx.profile.role).toBe('organizer')
  })
  it('owner check rejects an admin with the exact French message', async () => {
    profile = { role: 'organizer', org_role: 'admin' }
    await expect(requireOrganizer({ orgRole: 'owner' }))
      .rejects.toThrow('Réservé au propriétaire du compte.')
  })
  it('owner check treats null org_role as admin', async () => {
    profile = { role: 'organizer', org_role: null }
    await expect(requireOrganizer({ orgRole: 'owner' }))
      .rejects.toThrow('Réservé au propriétaire du compte.')
  })
  it('owner check passes an owner through', async () => {
    await expect(requireOrganizer({ orgRole: 'owner' })).resolves.toBeTruthy()
  })
})

describe('requireStudent', () => {
  it('throws Unauthorized for an organizer', async () => {
    await expect(requireStudent()).rejects.toThrow('Unauthorized')
  })
  it('returns user and profile for a student', async () => {
    profile = { role: 'student', org_role: null }
    const ctx = await requireStudent()
    expect(ctx.profile.role).toBe('student')
  })
})
