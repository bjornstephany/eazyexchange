import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithIntl } from '@/lib/test/renderWithIntl'

vi.mock('@/actions/apply', () => ({
  uploadApplicationPhoto: vi.fn(async () => ({ path: 'app-1/photo.png' })),
}))

const compressMock = vi.fn(async (f: File) => f)
vi.mock('@/lib/image-compression', () => ({
  compressImage: (f: File) => compressMock(f),
}))

import { ApplicationPhotoUpload } from '@/components/ApplicationPhotoUpload'
import { uploadApplicationPhoto } from '@/actions/apply'

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom has no createObjectURL; the component previews the picked file with it.
  ;(URL as any).createObjectURL = vi.fn(() => 'blob:preview')
})

function renderCard(over: Partial<Parameters<typeof ApplicationPhotoUpload>[0]> = {}) {
  return renderWithIntl(
    <ApplicationPhotoUpload token="t" initialPhotoUrl={null} invalid={false} onUploaded={() => {}} {...over} />,
  )
}

// The real file input is visually hidden (the styled button proxies it), so
// tests drive it via fireEvent.change on its aria-label.
function pickFile() {
  const file = new File(['x'], 'me.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Photo récente'), { target: { files: [file] } })
}

describe('ApplicationPhotoUpload', () => {
  it('shows the placeholder and "Choisir une photo" before any upload', () => {
    renderCard()
    expect(screen.getByRole('button', { name: /choisir une photo/i })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the existing photo and "Remplacer la photo" when one was already uploaded', () => {
    renderCard({ initialPhotoUrl: 'https://signed.example/photo.jpg' })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/photo.jpg')
    expect(screen.getByRole('button', { name: /remplacer la photo/i })).toBeInTheDocument()
  })

  it('uploads the picked file, then shows the preview and switches to "Remplacer"', async () => {
    const onUploaded = vi.fn()
    renderCard({ onUploaded })
    pickFile()
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:preview')
    expect(uploadApplicationPhoto).toHaveBeenCalledTimes(1)
    expect(onUploaded).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /remplacer la photo/i })).toBeInTheDocument()
  })

  it('shows the uploading state while the action is in flight', async () => {
    let resolveUpload!: (v: { path: string }) => void
    vi.mocked(uploadApplicationPhoto).mockImplementationOnce(
      () => new Promise(res => { resolveUpload = res }),
    )
    renderCard()
    pickFile()
    expect(await screen.findByRole('button', { name: /envoi…/i })).toBeDisabled()
    resolveUpload({ path: 'app-1/photo.png' })
    expect(await screen.findByRole('button', { name: /remplacer la photo/i })).toBeEnabled()
  })

  it('surfaces an upload failure and keeps the placeholder', async () => {
    vi.mocked(uploadApplicationPhoto).mockRejectedValueOnce(new Error('boom'))
    renderCard()
    pickFile()
    expect(await screen.findByText(/l’envoi a échoué/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the required-field message when invalid', () => {
    renderCard({ invalid: true })
    expect(screen.getByText(/une photo est requise/i)).toBeInTheDocument()
  })

  it('compresses the picked file before uploading it', async () => {
    const small = new File(['tiny'], 'me.png', { type: 'image/png' })
    compressMock.mockResolvedValueOnce(small)
    renderCard()
    pickFile()
    expect(await screen.findByRole('img')).toBeInTheDocument()
    expect(compressMock).toHaveBeenCalledTimes(1)
    const fd = vi.mocked(uploadApplicationPhoto).mock.calls[0][1] as FormData
    expect(fd.get('photo')).toBe(small)
  })

  it('shows the dedicated message when the image cannot be processed', async () => {
    compressMock.mockRejectedValueOnce(new Error('image-too-large'))
    renderCard()
    pickFile()
    expect(await screen.findByText(/ne peut pas être traitée/i)).toBeInTheDocument()
    expect(uploadApplicationPhoto).not.toHaveBeenCalled()
  })

  it('advertises automatic resizing instead of a size cap', () => {
    renderCard()
    expect(screen.getByText(/redimensionnée automatiquement/i)).toBeInTheDocument()
    expect(screen.queryByText(/10 Mo max/i)).not.toBeInTheDocument()
  })

  it('offers only image types in the file picker (no PDF)', () => {
    renderCard()
    expect(screen.getByLabelText('Photo récente')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })
})
