import { Logo } from '@/components/brand/Logo'
import { AuthCard } from './AuthCard'

export function CenteredCard({
  maxWidth,
  className,
  children,
}: {
  maxWidth: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-[#EEF1F7] px-4 py-10">
      <Logo href="/" />
      <AuthCard maxWidth={maxWidth} className={className}>
        {children}
      </AuthCard>
    </div>
  )
}
