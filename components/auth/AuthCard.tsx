import { cn } from '@/lib/utils'

export function AuthCard({
  maxWidth,
  className,
  children,
}: {
  maxWidth: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{ maxWidth }}
      className={cn(
        'w-full rounded-[18px] border border-[#E4E9F2] bg-white px-9 py-9 shadow-[0_18px_40px_-30px_rgba(16,32,63,0.25)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
