import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const updateProfile = vi.fn().mockResolvedValue(undefined)
const changePassword = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/settings', () => ({
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  inviteOrganizer: vi.fn(), revokeOrganizerInvite: vi.fn(),
  archiveExchange: vi.fn(), restoreExchange: vi.fn(),
}))
import { SettingsView } from '@/components/settings/SettingsView'

const baseProps = {
  profile: {
    fullName: 'Marie Blanchet', email: 'm.blanchet@lycee-mistral.fr',
    phone: '06 12 45 78 90', title: 'Coordinatrice des échanges', schoolName: 'Lycée Frédéric Mistral',
  },
  isOwner: false,
  canChangePassword: true,
  team: { members: [], pending: [] },
  billing: null,
  program: null,
}

describe('SettingsView — Compte', () => {
  beforeEach(() => { updateProfile.mockClear(); changePassword.mockClear() })

  it('renders H1, subline and the profile fields', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Réglages' })).toBeInTheDocument()
    expect(screen.getByText('Votre compte, votre équipe et votre abonnement.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Marie Blanchet')
    expect(screen.getByLabelText('Adresse e-mail')).toBeDisabled()
    expect(screen.getByLabelText('Fonction')).toHaveValue('Coordinatrice des échanges')
    expect(screen.getByLabelText('Établissement')).toHaveValue('Lycée Frédéric Mistral')
  })

  it('saves the profile and flashes confirmation', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '06 00 00 00 00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('✓ Modifications enregistrées')).toBeInTheDocument()
    expect(updateProfile).toHaveBeenCalledWith({
      fullName: 'Marie Blanchet', phone: '06 00 00 00 00',
      title: 'Coordinatrice des échanges', schoolName: 'Lycée Frédéric Mistral',
    })
  })

  it('password panel: mismatch is caught client-side', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('password panel: happy path calls the action and closes', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer'), { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('✓ Mot de passe mis à jour')).toBeInTheDocument()
    expect(changePassword).toHaveBeenCalledWith('oldpassword', 'newpassword')
  })

  it('Google-only account: no password button, explanatory note instead', () => {
    render(<SettingsView {...baseProps} canChangePassword={false} />)
    expect(screen.queryByRole('button', { name: 'Modifier le mot de passe' })).toBeNull()
    expect(screen.getByText('Connexion via Google — la gestion du mot de passe ne s’applique pas à votre compte.')).toBeInTheDocument()
  })
})
