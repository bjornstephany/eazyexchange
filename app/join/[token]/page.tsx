import { getJoinInvite } from '@/actions/join'
import { Logo } from '@/components/brand/Logo'
import { JoinForm } from '@/components/auth/JoinForm'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const STATE_COPY: Record<string, string> = {
  invalid: 'Ce lien d’invitation est invalide.',
  expired: 'Ce lien d’invitation a expiré — demandez à votre collègue de renvoyer une invitation.',
  revoked: 'Cette invitation a été révoquée.',
  accepted: 'Cette invitation a déjà été utilisée.',
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await getJoinInvite(token)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo />
      {info.state === 'ok' ? (
        <JoinForm token={token} email={info.email} schoolName={info.schoolName} />
      ) : (
        <div className="w-full max-w-sm rounded-2xl border bg-card p-7 text-center">
          <p className="text-sm text-muted-foreground">{STATE_COPY[info.state]}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
            Se connecter
          </Link>
        </div>
      )}
    </div>
  )
}