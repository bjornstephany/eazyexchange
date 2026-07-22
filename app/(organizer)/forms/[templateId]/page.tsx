import { getTranslations } from 'next-intl/server'
import { getTemplate } from '@/actions/forms'
import { TemplateEditor } from '@/components/forms/TemplateEditor'

export default async function EditFormPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const template = await getTemplate(templateId)
  const t = await getTranslations('organizer')
  return <TemplateEditor template={template} backHref="/forms" backLabel={t('pages.formDetail.backLabel')} />
}
