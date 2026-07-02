import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Mark } from './Mark'

export function Logo({
  className,
  href = '/',
}: {
  className?: string
  href?: string | null
}) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark className="h-5 w-7 shrink-0" />
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        Eazyexchange
      </span>
    </span>
  )
  if (href === null) return mark
  return (
    <Link href={href} aria-label="Eazyexchange home" className="inline-flex items-center">
      {mark}
    </Link>
  )
}
