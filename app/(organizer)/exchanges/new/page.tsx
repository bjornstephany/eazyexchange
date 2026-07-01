import { createClient } from '@/lib/supabase/server'
import { NewExchangeForm } from '@/components/NewExchangeForm'

export default async function NewExchangePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let needsSchoolName = false
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('school_id').eq('id', user.id).single()
    if (profile) {
      const { data: school } = await supabase
        .from('schools').select('name').eq('id', profile.school_id).single()
      needsSchoolName = school?.name === ''
    }
  }

  return <NewExchangeForm needsSchoolName={needsSchoolName} />
}
