import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { landingContent } from '@/lib/landing/content'
import { Logo } from '@/components/brand/Logo'

export function LandingNav() {
  const { login, getStarted } = landingContent.nav
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
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
