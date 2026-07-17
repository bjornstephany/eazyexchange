import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ApplicantAvatar } from '@/components/applications/ApplicantAvatar'

describe('ApplicantAvatar', () => {
  it('renders the photo when a signed URL is present', () => {
    const { container } = render(
      <ApplicantAvatar photoUrl="https://signed.example/p.jpg" data={{ first_name: 'Zoé', last_name: 'Martin' }} email="z@x.co" />,
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed.example/p.jpg')
  })
  it('falls back to initials when photoUrl is null', () => {
    const { container } = render(
      <ApplicantAvatar photoUrl={null} data={{ first_name: 'Zoé', last_name: 'Martin' }} email="z@x.co" />,
    )
    expect(screen.getByText('ZM')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
  it('falls back to the email initial when the row has no names', () => {
    render(<ApplicantAvatar photoUrl={null} data={{}} email="zoe@example.com" />)
    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})
