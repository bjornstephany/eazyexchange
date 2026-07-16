import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const del = vi.fn().mockResolvedValue(undefined)
vi.mock('@/actions/forms', () => ({ deleteTemplate: (...a: unknown[]) => del(...a) }))

import { DeleteTemplateButton } from '@/components/forms/DeleteTemplateButton'

describe('DeleteTemplateButton', () => {
  beforeEach(() => { del.mockClear(); del.mockResolvedValue(undefined); refresh.mockClear() })

  it('deletes when the confirm is accepted (revalidation happens in the action)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithIntl(<DeleteTemplateButton templateId="t1" confirmText="Supprimer ?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('t1'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does nothing when the confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderWithIntl(<DeleteTemplateButton templateId="t1" confirmText="Supprimer ?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(del).not.toHaveBeenCalled()
  })

  it('alerts the generic error message when the action fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    del.mockRejectedValueOnce(new Error('Boom'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderWithIntl(<DeleteTemplateButton templateId="t1" confirmText="Supprimer ?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Boom'))
  })
})
