import { describe, it, expect } from 'vitest'
import { standardQuestionnaire } from '@/lib/application-templates/library'
import { removeQuestion } from '@/lib/application-fields'
import { editorRows } from '../rows'

const t = ((key: string) => `T:${key}`) as never

describe('editorRows', () => {
  const student = editorRows(standardQuestionnaire(), 'student', t)

  it('puts the portrait first, typed as a photo and removable', () => {
    expect(student[0]).toMatchObject({ id: 'photo', type: 'photo', locked: false, custom: false })
    expect(student[0].label).toBe('T:photo.label')
  })

  it('marks the three invitation-driving questions as locked', () => {
    const locked = student.filter(r => r.locked).map(r => r.id)
    expect(locked.sort()).toEqual(['email', 'first_name', 'last_name'])
  })

  it('labels built-ins through the apply catalog', () => {
    expect(student.find(r => r.id === 'nationality')!.label).toBe('T:fields.nationality.label')
  })

  it('labels a custom question verbatim and marks it editable', () => {
    const doc = standardQuestionnaire()
    doc.sections[0].fields.push({ id: 'c_7f3a', type: 'yesno', label: 'Sait nager ?', required: true })
    const row = editorRows(doc, 'student', t).at(-1)!
    expect(row).toMatchObject({ id: 'c_7f3a', label: 'Sait nager ?', type: 'yesno', custom: true, required: true, locked: false })
  })

  it("carries a custom question's options through for the edit dialog", () => {
    const doc = standardQuestionnaire()
    doc.sections[0].fields.push({
      id: 'c_1', type: 'radio', label: 'Régime',
      options: [{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }],
    })
    expect(editorRows(doc, 'student', t).at(-1)!.options)
      .toEqual([{ value: 'o1', label: 'Végétarien' }, { value: 'o2', label: 'Aucun' }])
  })

  it('drops a row for an unknown ref rather than rendering a blank one', () => {
    const doc = standardQuestionnaire()
    doc.sections[2].fields.push({ ref: 'no_such_field' })
    expect(editorRows(doc, 'hosting', t).map(r => r.id)).not.toContain('no_such_field')
  })

  it('reflects a removal', () => {
    const doc = removeQuestion(standardQuestionnaire(), 'hosting', 'pets')
    expect(editorRows(doc, 'hosting', t).map(r => r.id)).not.toContain('pets')
  })
})
