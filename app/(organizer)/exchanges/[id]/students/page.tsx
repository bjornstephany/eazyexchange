import { getExchange } from '@/actions/exchanges'
import { getExchangeStudents } from '@/actions/students'
import { InviteStudentForm } from '@/components/InviteStudentForm'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function StudentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exchange, students] = await Promise.all([
    getExchange(id),
    getExchangeStudents(id),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-slate-500">
            <Link href={`/exchanges/${id}`}>← Back to {exchange.name}</Link>
          </Button>
          <h1 className="text-2xl font-semibold">Students</h1>
        </div>
      </div>

      <div className="mb-8 max-w-md">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Invite a student</h2>
        <InviteStudentForm exchangeId={id} />
        <p className="text-xs text-slate-400 mt-2">
          The student will receive an email to set up their account and will be auto-assigned all current forms.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-3">
          Enrolled students ({students.length})
        </h2>
        {students.length === 0 ? (
          <p className="text-sm text-slate-500">No students invited yet.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {students.map(student => (
              <div key={student.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {student.full_name || <span className="text-slate-400 italic">Pending setup</span>}
                  </p>
                  <p className="text-xs text-slate-500">{student.email}</p>
                </div>
                <Badge variant={student.full_name ? 'secondary' : 'outline'}>
                  {student.full_name ? 'Active' : 'Invite pending'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
