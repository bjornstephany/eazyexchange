import { describe, it, expect } from 'vitest'
import {
  STUDENTS,
  SMOKE_STUDENTS,
  APPLICANTS,
  TEMPLATES,
  SHAPES,
  HIGHLIGHTS,
  SHAPE_LABELS,
} from '../seed-cast.mjs'

describe('seed cast', () => {
  it('has 20 students', () => {
    expect(STUDENTS).toHaveLength(20)
  })

  it('gives every student a unique slug and email-safe name', () => {
    const slugs = STUDENTS.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of STUDENTS) {
      expect(s.slug).toMatch(/^eleve-\d{2}$/)
      expect(s.name.trim()).not.toBe('')
    }
  })

  it('references only shapes that exist', () => {
    for (const s of STUDENTS) {
      expect(SHAPES, `shape "${s.shape}" used by ${s.slug}`).toHaveProperty(s.shape)
    }
  })

  it('uses every defined shape at least once', () => {
    const used = new Set(STUDENTS.map((s) => s.shape))
    for (const name of Object.keys(SHAPES)) {
      expect(used, `shape "${name}" is defined but unused`).toContain(name)
    }
  })

  it('gives every shape exactly one entry per template', () => {
    for (const [name, statuses] of Object.entries(SHAPES)) {
      expect(statuses, `shape "${name}"`).toHaveLength(TEMPLATES.length)
    }
  })

  it('uses only statuses the submissions table accepts', () => {
    const allowed = new Set(['draft', 'submitted', 'approved', 'rejected', null])
    for (const [name, statuses] of Object.entries(SHAPES)) {
      for (const s of statuses) {
        expect(allowed, `shape "${name}" has status "${s}"`).toContain(s)
      }
    }
  })

  it('labels every shape', () => {
    for (const name of Object.keys(SHAPES)) {
      expect(SHAPE_LABELS, `shape "${name}" has no label`).toHaveProperty(name)
      expect(SHAPE_LABELS[name].trim()).not.toBe('')
    }
  })

  it('includes deliberate layout landmines', () => {
    expect(STUDENTS.some((s) => s.name.length >= 30)).toBe(true)
    expect(STUDENTS.some((s) => /[àâäéèêëïîôöùûüçÿœ]/i.test(s.name))).toBe(true)
  })

  it('highlights four students that exist', () => {
    expect(HIGHLIGHTS).toHaveLength(4)
    for (const slug of HIGHLIGHTS) {
      expect(STUDENTS.map((s) => s.slug)).toContain(slug)
    }
  })

  it('keeps the nine applicants', () => {
    expect(APPLICANTS).toHaveLength(9)
    expect(new Set(APPLICANTS.map((a) => a.status))).toEqual(
      new Set(['invited', 'draft', 'submitted', 'rejected', 'accepted', 'declined']),
    )
  })
})

describe('reserved smoke cast', () => {
  it('reserves exactly two students', () => {
    expect(SMOKE_STUDENTS).toHaveLength(2)
    expect(SMOKE_STUDENTS.map((s) => s.slug)).toEqual(['smoke-01', 'smoke-02'])
  })

  it('leaves them untouched so a reset is a no-op on a fresh seed', () => {
    for (const s of SMOKE_STUDENTS) {
      expect(s.shape).toBe('untouched')
    }
  })

  it('keeps them out of the twenty human-facing students and the highlight set', () => {
    const human = STUDENTS.map((s) => s.slug)
    for (const s of SMOKE_STUDENTS) {
      expect(human).not.toContain(s.slug)
      expect(HIGHLIGHTS).not.toContain(s.slug)
    }
    expect(STUDENTS).toHaveLength(20)
  })
})
