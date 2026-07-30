import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getProfile = vi.fn()
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })

vi.mock('@/lib/supabase/request', () => ({ getProfile: () => getProfile() }))
// useRouter: the page renders SignOutLink, a client component that needs it.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import PendingPage from '../pending/page'

beforeEach(() => {
  getProfile.mockReset()
  redirect.mockClear()
})

describe('/pending', () => {
  // /pending survives the waitlist change as the terminal page for the one
  // legacy `pending` row in production. Nobody is reviewing a queue any more,
  // so the copy no longer promises one.
  it('tells a pending organizer their access is not open yet, with no promise of a review', async () => {
    getProfile.mockResolvedValue({ status: 'pending', role: 'organizer' })
    render(await PendingPage())
    // By role: the body paragraph also says « pas encore ouvert à tous ».
    expect(screen.getByRole('heading', { name: /pas encore ouvert/i })).toBeInTheDocument()
    expect(screen.queryByText(/en cours d’examen/i)).not.toBeInTheDocument()
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
  })

  it('tells a rejected organizer plainly, with a contact address', async () => {
    getProfile.mockResolvedValue({ status: 'rejected', role: 'organizer' })
    render(await PendingPage())
    expect(screen.getByText(/contact@eazyexchange\.com/)).toBeInTheDocument()
  })

  // The only escape hatch: every other sign-out lives in the organizer/student
  // shells, which a non-approved account can never reach. Without this, someone
  // who signed up with the wrong address can never switch accounts.
  it.each(['pending', 'rejected'])('offers a %s account a way to sign out', async (status) => {
    getProfile.mockResolvedValue({ status, role: 'organizer' })
    render(await PendingPage())
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeInTheDocument()
  })

  it('sends an approved organizer to the app', async () => {
    getProfile.mockResolvedValue({ status: 'approved', role: 'organizer' })
    await expect(PendingPage()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('sends an approved student to their forms', async () => {
    getProfile.mockResolvedValue({ status: 'approved', role: 'student' })
    await expect(PendingPage()).rejects.toThrow('REDIRECT:/my-forms')
  })

  it('sends a session with no profile to login', async () => {
    getProfile.mockResolvedValue(null)
    await expect(PendingPage()).rejects.toThrow('REDIRECT:/login')
  })
})
