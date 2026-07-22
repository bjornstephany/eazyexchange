import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))
const signOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut } }) }))
vi.mock('@/actions/settings', () => ({ updateLocale: vi.fn().mockResolvedValue(undefined) }))

import { StudentTopBar } from '@/components/student/StudentTopBar'

beforeEach(() => { push.mockClear(); refresh.mockClear(); signOut.mockClear() })

describe('StudentTopBar', () => {
  it('shows the exchange session label when present', () => {
    renderWithIntl(<StudentTopBar initials="LD" exchangeLabel="Espagne 2026" locale="fr" />)
    expect(screen.getByText('Espagne 2026')).toBeTruthy()
  })
  it('omits the label when null', () => {
    renderWithIntl(<StudentTopBar initials="LD" exchangeLabel={null} locale="fr" />)
    expect(screen.queryByText(/Espagne/)).toBeNull()
  })
  it('opens the avatar menu and signs out', async () => {
    renderWithIntl(<StudentTopBar initials="LD" exchangeLabel={null} locale="fr" />)
    expect(screen.queryByText('Se déconnecter')).toBeNull()
    fireEvent.click(screen.getByLabelText('Compte'))
    fireEvent.click(screen.getByText('Se déconnecter'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
  it('offers the language control inside the menu', () => {
    renderWithIntl(<StudentTopBar initials="LD" exchangeLabel={null} locale="fr" />)
    fireEvent.click(screen.getByLabelText('Compte'))
    expect(screen.getByText('Langue')).toBeTruthy()
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('fr')
  })
})
