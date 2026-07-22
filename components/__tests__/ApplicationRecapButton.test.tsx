import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const downloadApplicationRecap = vi.fn(async (_token: string, _language?: 'en' | 'fr') => ({
  ok: true as const, filename: 'candidature-zoe-dupont.pdf', pdf: Buffer.from('%PDF-x').toString('base64'),
}))
vi.mock('@/actions/apply', () => ({
  downloadApplicationRecap: (token: string, language?: 'en' | 'fr') => downloadApplicationRecap(token, language),
}))

import { ApplicationRecapButton } from '@/components/ApplicationRecapButton'

let clickSpy: ReturnType<typeof vi.fn>
let lastAnchor: HTMLAnchorElement | null

beforeEach(() => {
  vi.clearAllMocks()
  downloadApplicationRecap.mockResolvedValue({
    ok: true, filename: 'candidature-zoe-dupont.pdf', pdf: Buffer.from('%PDF-x').toString('base64'),
  })
  clickSpy = vi.fn()
  lastAnchor = null
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
    const el = origCreate(tag)
    if (tag === 'a') {
      el.click = clickSpy
      lastAnchor = el
    }
    return el
  })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ApplicationRecapButton', () => {
  it('renders the French label by default', () => {
    render(<ApplicationRecapButton token="t" language="fr" />)
    expect(screen.getByRole('button', { name: /télécharger mes réponses/i })).toBeInTheDocument()
  })

  it('renders the English label', () => {
    render(<ApplicationRecapButton token="t" language="en" />)
    expect(screen.getByRole('button', { name: /download my answers/i })).toBeInTheDocument()
  })

  it('downloads the PDF with the server-supplied filename', async () => {
    render(<ApplicationRecapButton token="tok-1" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    await waitFor(() => expect(downloadApplicationRecap).toHaveBeenCalledWith('tok-1', 'fr'))
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
    expect(lastAnchor?.download).toBe('candidature-zoe-dupont.pdf')
  })

  it('disables the button and shows a preparing label while in flight', async () => {
    let resolve!: (v: any) => void
    downloadApplicationRecap.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByRole('button', { name: /préparation…/i })).toBeDisabled()
    resolve({ ok: true, filename: 'a.pdf', pdf: '' })
    await waitFor(() => expect(screen.getByRole('button', { name: /télécharger mes réponses/i })).toBeEnabled())
  })

  it('renders an inline message for an expired link instead of downloading', async () => {
    downloadApplicationRecap.mockResolvedValueOnce({ ok: false, reason: 'expired' } as any)
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/ce lien a expiré/i)
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('renders an inline message for an unknown link', async () => {
    downloadApplicationRecap.mockResolvedValueOnce({ ok: false, reason: 'not_found' } as any)
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByText(/n’est plus valide/i)).toBeInTheDocument()
  })

  it('renders a generic retry line when the action throws', async () => {
    downloadApplicationRecap.mockRejectedValueOnce(new Error('digest-abc123'))
    render(<ApplicationRecapButton token="t" language="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /télécharger mes réponses/i }))
    expect(await screen.findByText(/le téléchargement a échoué/i)).toBeInTheDocument()
    // Never surface the raw (redacted) error text.
    expect(screen.queryByText(/digest-abc123/)).not.toBeInTheDocument()
  })
})
