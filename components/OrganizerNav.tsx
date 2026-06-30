'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/Logo'

export function OrganizerNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b bg-card px-6 py-3 flex items-center gap-6">
      <Logo />
      <Link
        href="/dashboard"
        className={cn(
          'text-sm',
          pathname === '/dashboard'
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Exchanges
      </Link>
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </nav>
  )
}
