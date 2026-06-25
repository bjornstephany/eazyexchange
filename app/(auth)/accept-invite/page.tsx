'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AcceptInvitePage() {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // The session was already established server-side by /auth/confirm, so the
    // browser client is authenticated here — just set the chosen password.
    const { data: { user }, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError || !user) {
      setError(updateError?.message ?? 'Your invite link is invalid or has expired — ask your organizer to resend it.')
      setLoading(false)
      return
    }

    // Upsert profile (school_id was set by organizer invite action)
    const { error: profileError } = await supabase
      .from('users')
      .update({ full_name: fullName })
      .eq('id', user.id)
    if (profileError) { setError(profileError.message); setLoading(false); return }

    router.push('/my-forms')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set up your account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAccept} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName}
                onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Choose a password</Label>
              <Input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)} required minLength={8} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Setting up…' : 'Get started'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
