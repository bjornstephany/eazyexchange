import { getStudentInfoCards } from '@/actions/student-info'
import { InfoCardsView } from '@/components/student/InfoCardsView'

export default async function InfosPage() {
  const cards = await getStudentInfoCards()
  return <InfoCardsView cards={cards} />
}
