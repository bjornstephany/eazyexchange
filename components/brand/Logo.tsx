import Link from 'next/link'
import { cn } from '@/lib/utils'
import { GlobeMark } from './GlobeMark'

export function Logo({
  className,
  href = '/',
}: {
  className?: string
  href?: string | null
}) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <GlobeMark className="h-7 w-7 shrink-0" />
      <span className="text-lg font-bold tracking-tight text-foreground">
        <span className="text-primary">Eazy</span>Exchange
      </span>
    </span>
  )
  if (href === null) return mark
  return (
    <Link href={href} aria-label="EazyExchange home" className="inline-flex items-center">
      {mark}
    </Link>
  )
}
