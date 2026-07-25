import { describe, it, expect } from 'vitest'
import {
  shellDestination,
  PROFILE_MISSING_DESTINATION,
} from '@/lib/auth/shell-destination'

describe('shellDestination', () => {
  it('renders the organizer shell for an organizer', () => {
    expect(shellDestination('organizer', 'organizer')).toBeNull()
  })

  it('renders the student shell for a student', () => {
    expect(shellDestination('student', 'student')).toBeNull()
  })

  it('sends a student who reached the organizer shell to their own', () => {
    expect(shellDestination('student', 'organizer')).toBe('/my-forms')
  })

  it('sends an organizer who reached the student shell to their own', () => {
    expect(shellDestination('organizer', 'student')).toBe('/dashboard')
  })

  describe('missing profile — the blank-tab regression', () => {
    // Both shells used to fold "no profile" into "not my role", so a null
    // profile satisfied BOTH guards: /dashboard sent it to /my-forms, which
    // sent it back to /dashboard, until the browser gave up and showed a blank
    // tab. The fix is that a missing profile leaves the shells entirely.
    it('leaves the organizer shell for a terminal destination', () => {
      expect(shellDestination(null, 'organizer')).toBe(PROFILE_MISSING_DESTINATION)
    })

    it('leaves the student shell for a terminal destination', () => {
      expect(shellDestination(null, 'student')).toBe(PROFILE_MISSING_DESTINATION)
    })

    it('treats undefined the same as null', () => {
      expect(shellDestination(undefined, 'organizer')).toBe(PROFILE_MISSING_DESTINATION)
    })

    it('cannot loop: neither shell sends a missing profile to the other shell', () => {
      const shellRoutes = ['/dashboard', '/my-forms']
      for (const shell of ['organizer', 'student'] as const) {
        const dest = shellDestination(null, shell)
        expect(dest).not.toBeNull()
        expect(shellRoutes).not.toContain(dest)
      }
    })

    it('both shells agree on one destination, so there is nothing to ping-pong between', () => {
      expect(shellDestination(null, 'organizer')).toBe(shellDestination(null, 'student'))
    })

    it('lands on an auth route, which middleware lets a profile-less session reach', () => {
      // middleware.ts returns supabaseResponse for a session with no users row
      // on auth routes, so /login is genuinely terminal rather than another hop.
      expect(PROFILE_MISSING_DESTINATION.startsWith('/login')).toBe(true)
    })
  })
})
