import { applicantInitials } from '@/lib/application-form'

// 28px round applicant avatar for list rows. Decorative (empty alt): the
// student's name is always rendered right next to it.
export function ApplicantAvatar({ photoUrl, data, email }: {
  photoUrl: string | null
  data: Record<string, string>
  email: string
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className="h-7 w-7 shrink-0 rounded-full border object-cover" />
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-muted-foreground">
      {applicantInitials(data, email)}
    </span>
  )
}
