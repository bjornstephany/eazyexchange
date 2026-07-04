import { getMyAssignments } from '@/actions/my-forms'
import { getStudentContext } from '@/actions/student-context'
import { buildDossier, type RawAssignment } from '@/lib/student/dossier'
import { DossierView } from '@/components/student/DossierView'

export default async function MyFormsPage() {
  const [assignments, ctx] = await Promise.all([getMyAssignments(), getStudentContext()])
  const dossier = buildDossier(assignments as RawAssignment[])
  return <DossierView dossier={dossier} firstName={ctx.firstName} />
}
