'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function StudentNav() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b bg-white px-6 py-3 flex items-center">
      <span className="font-semibold text-slate-900">EazyExchange</span>
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
      </div>
    </nav>
  )
}
