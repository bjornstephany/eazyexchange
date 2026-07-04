import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
const signOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut } }) }))

import { StudentTopBar } from '@/components/student/StudentTopBar'

beforeEach(() => { push.mockClear(); refresh.mockClear(); signOut.mockClear() })

describe('StudentTopBar', () => {
  it('shows the exchange session label when present', () => {
    render(<StudentTopBar initials="LD" exchangeLabel="Espagne 2026" />)
    expect(screen.getByText('Espagne 2026')).toBeTruthy()
  })
  it('omits the label when null', () => {
    render(<StudentTopBar initials="LD" exchangeLabel={null} />)
    expect(screen.queryByText(/Espagne/)).toBeNull()
  })
  it('opens the avatar menu and signs out', async () => {
    render(<StudentTopBar initials="LD" exchangeLabel={null} />)
    expect(screen.queryByText('Se déconnecter')).toBeNull()
    fireEvent.click(screen.getByLabelText('Compte'))
    fireEvent.click(screen.getByText('Se déconnecter'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
