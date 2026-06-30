'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/Logo'

export function StudentNav() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b bg-card px-6 py-3 flex items-center">
      <Logo />
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </nav>
  )
}
