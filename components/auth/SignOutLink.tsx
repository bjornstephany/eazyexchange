'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// The only way off /pending. Every other sign-out in the app lives in the
// organizer/student shells, which a non-approved account can never reach — so
// someone who signed up with the wrong address had no way to switch accounts.
export function SignOutLink({ label = 'Se déconnecter' }: { label?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleSignOut() {
    setBusy(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="self-start text-[14px] font-medium text-[#5B6B8C] underline-offset-2 hover:text-[#2456E6] hover:underline disabled:opacity-60"
    >
      {label}
    </button>
  )
}
