import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { landingContent } from '@/lib/landing/content'

export function LandingNav() {
  const { brand, login, getStarted } = landingContent.nav
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold">
          {brand}
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={login.href}>{login.label}</Link>
          </Button>
          <Button asChild>
            <Link href={getStarted.href}>{getStarted.label}</Link>
          </Button>
        </div>
      </nav>
    </header>
  )
}
