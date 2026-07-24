import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
const updateProfile = vi.fn().mockResolvedValue({ ok: true })
const changePassword = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/actions/settings', () => ({
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  inviteOrganizer: vi.fn().mockResolvedValue(undefined),
  revokeOrganizerInvite: vi.fn().mockResolvedValue(undefined),
  archiveExchange: vi.fn().mockResolvedValue(undefined),
  restoreExchange: vi.fn().mockResolvedValue(undefined),
  updateLocale: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/exchanges', () => ({
  updateReminderSettings: vi.fn().mockResolvedValue(undefined),
}))
import { SettingsView } from '@/components/settings/SettingsView'

const render = renderWithIntl

const baseProps = {
  profile: {
    fullName: 'Marie Blanchet', email: 'm.blanchet@lycee-mistral.fr',
    schoolName: 'Lycée Frédéric Mistral',
  },
  isOwner: false,
  canChangePassword: true,
  team: { members: [], pending: [] },
  billing: null,
  program: null,
  programDetails: null,
  locale: 'fr' as const,
  subjects: [],
}

describe('SettingsView — Compte', () => {
  beforeEach(() => { updateProfile.mockClear(); changePassword.mockClear() })

  it('renders H1, subline and the profile fields', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Réglages' })).toBeInTheDocument()
    expect(screen.getByText('Votre compte, votre équipe et votre abonnement.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Marie Blanchet')
    expect(screen.getByLabelText('Adresse e-mail')).toBeDisabled()
    expect(screen.getByLabelText('Établissement')).toHaveValue('Lycée Frédéric Mistral')
  })

  it('saves only the full name, and flashes confirmation', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.change(screen.getByLabelText('Nom complet'), { target: { value: 'Marie B. Blanchet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('✓ Modifications enregistrées')).toBeInTheDocument()
    expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Marie B. Blanchet' })
  })

  it('shows the message of a structured save failure', async () => {
    updateProfile.mockResolvedValueOnce({ ok: false, message: 'Le nom ne peut pas être vide.' })
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Le nom ne peut pas être vide.')).toBeInTheDocument()
    expect(screen.queryByText('✓ Modifications enregistrées')).toBeNull()
  })

  it('password panel: mismatch is caught client-side', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('Les mots de passe ne correspondent pas.')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('password panel: happy path calls the action and closes', async () => {
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('✓ Mot de passe mis à jour')).toBeInTheDocument()
    expect(changePassword).toHaveBeenCalledWith('oldpassword', 'newpassword')
  })

  // The four expected failures (wrong current password, too short, leaked,
  // rate limited) arrive as structured results — a throw would surface as an
  // opaque digest in production.
  it('password panel: a structured failure is shown verbatim and the panel stays open', async () => {
    changePassword.mockResolvedValueOnce({ ok: false, message: 'Mot de passe actuel incorrect.' })
    render(<SettingsView {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le mot de passe' }))
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'wrongpassword' } })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe'), { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }))
    expect(await screen.findByText('Mot de passe actuel incorrect.')).toBeInTheDocument()
    expect(screen.queryByText('✓ Mot de passe mis à jour')).toBeNull()
    expect(screen.getByLabelText('Mot de passe actuel')).toBeInTheDocument()
  })

  it('Google-only account: no password button, explanatory note instead', () => {
    render(<SettingsView {...baseProps} canChangePassword={false} />)
    expect(screen.queryByRole('button', { name: 'Modifier le mot de passe' })).toBeNull()
    expect(screen.getByText('Connexion via Google — la gestion du mot de passe ne s’applique pas à votre compte.')).toBeInTheDocument()
  })
})

const owner = {
  ...baseProps,
  isOwner: true,
  team: {
    members: [
      { id: 'u1', name: 'Marie Blanchet', email: 'm.blanchet@lycee-mistral.fr', isOwner: true, isYou: true },
      { id: 'u2', name: 'Antoine Dubois', email: 'a.dubois@lycee-mistral.fr', isOwner: false, isYou: false },
    ],
    pending: [{ id: 'i1', email: 'j.moreau@lycee-mistral.fr' }],
  },
  billing: {
    planLabel: 'Essai gratuit', price: '0 €', per: '', desc: 'Votre premier échange est offert — aucun paiement requis.',
    usageLabel: '1 / 1 échange utilisé', usagePct: 100,
    payment: { note: 'Aucun moyen de paiement enregistré.', manage: null },
  },
  program: {
    id: 'ex1', name: 'Programme Espagne', year: 2026, archived: false,
    enrolled: 10, applications: 12, earliestDeadline: '2026-10-10',
  },
}

describe('SettingsView — owner sections', () => {
  it('admin sees only Compte + Équipe in the nav', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Compte personnel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Équipe & rôles' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Facturation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Programme' })).toBeNull()
  })

  it('team: members, VOUS + Propriétaire pills, pending invite with revoke (owner only)', async () => {
    const { inviteOrganizer, revokeOrganizerInvite } = await import('@/actions/settings')
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & rôles' }))
    expect(screen.getByText('VOUS')).toBeInTheDocument()
    expect(screen.getAllByText('Propriétaire').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Antoine Dubois')).toBeInTheDocument()
    expect(screen.getByText('Invitation envoyée')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }))
    expect(revokeOrganizerInvite).toHaveBeenCalledWith('i1')
    fireEvent.change(screen.getByPlaceholderText('adresse@etablissement.fr'), { target: { value: 'x@lycee.fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inviter' }))
    expect(inviteOrganizer).toHaveBeenCalledWith('x@lycee.fr')
  })

  it('team as admin: list visible, no invite row, no revoke', () => {
    render(<SettingsView {...baseProps} team={owner.team} />)
    fireEvent.click(screen.getByRole('button', { name: 'Équipe & rôles' }))
    expect(screen.getByText('Antoine Dubois')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('adresse@etablissement.fr')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Révoquer' })).toBeNull()
  })

  // On the trial the payment row carries no button at all: the card is
  // collected when a plan is chosen, and a link to /billing (the plan-selection
  // page) mislabelled "Add a card" is the second-subscription path.
  it('billing: plan card, usage, and no payment button on the trial', () => {
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Facturation' }))
    expect(screen.getByText('Essai gratuit')).toBeInTheDocument()
    expect(screen.getByText('0 €')).toBeInTheDocument()
    expect(screen.getByText('1 / 1 échange utilisé')).toBeInTheDocument()
    expect(screen.getByText('Aucun moyen de paiement enregistré.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les forfaits' })).toHaveAttribute('href', '/billing')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('billing: an active plan manages its card through the Stripe portal', () => {
    render(
      <SettingsView
        {...owner}
        billing={{
          ...owner.billing,
          payment: {
            note: 'Visa •••• 4242 — expire 04/29',
            manage: { cta: 'Modifier', href: '/billing/portal' },
          },
        }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Facturation' }))
    expect(screen.getByText('Visa •••• 4242 — expire 04/29')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Modifier' })).toHaveAttribute('href', '/billing/portal')
  })

  it('program: stats line, archive modal confirm', async () => {
    const { archiveExchange } = await import('@/actions/settings')
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('10 élèves acceptés · 12 candidatures · date limite dossiers 10 oct')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver le programme…' }))
    expect(screen.getByText('Archiver ce programme ?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver le programme' }))
    expect(archiveExchange).toHaveBeenCalledWith('ex1')
  })

  it('program: archived state shows Restaurer', async () => {
    const { restoreExchange } = await import('@/actions/settings')
    render(<SettingsView {...owner} program={{ ...owner.program, archived: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('Archivé')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurer' }))
    expect(restoreExchange).toHaveBeenCalledWith('ex1')
  })
})

describe('SettingsView — Programme for all organizers', () => {
  it('admin with an active program sees Programme, no billing, no danger zone', () => {
    render(<SettingsView {...baseProps} program={owner.program} />)
    expect(screen.queryByRole('button', { name: 'Facturation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByText('10 élèves acceptés · 12 candidatures · date limite dossiers 10 oct')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archiver le programme…' })).toBeNull()
  })

  it('owner sees the archive zone', () => {
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.getByRole('button', { name: 'Archiver le programme…' })).toBeInTheDocument()
  })

  // The reminder and good-news cards moved to the Communication tab — see
  // components/communication/__tests__/CommunicationView.test.tsx.
  it('no longer renders the reminder or good-news cards', () => {
    render(<SettingsView {...owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Programme' }))
    expect(screen.queryByText('Rappels automatiques')).toBeNull()
    expect(screen.queryByText('E-mail « Bonne nouvelle » aux parents')).toBeNull()
    expect(screen.queryByRole('radio', { name: /Normale/ })).toBeNull()
  })
})

// One rule, no exceptions: the school name is read-only for every organizer in
// every country, so there is no client write path to schools.name left.
describe('SettingsView — the school name is locked for everyone', () => {
  it('an owner cannot edit it', () => {
    render(<SettingsView {...baseProps} isOwner={true} />)
    expect(screen.getByLabelText('Établissement')).toBeDisabled()
    expect(screen.getByText(/défini à la création du compte/)).toBeInTheDocument()
  })

  it('an admin cannot edit it either', () => {
    render(<SettingsView {...baseProps} />)
    expect(screen.getByLabelText('Établissement')).toBeDisabled()
    expect(screen.getByText(/défini à la création du compte/)).toBeInTheDocument()
  })
})
