import { getJoinInvite } from '@/actions/join'
import { Logo } from '@/components/brand/Logo'
import { JoinForm } from '@/components/auth/JoinForm'
import { JOIN_ERROR_MESSAGES } from '@/lib/team/join-result'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

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
          <p className="text-sm text-muted-foreground">{JOIN_ERROR_MESSAGES[info.state]}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
            Se connecter
          </Link>
        </div>
      )}
    </div>
  )
}