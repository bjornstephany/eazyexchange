import { describe, it, expect } from 'vitest'
import { FILLABLE_DEFINITIONS } from '../index'
import type { Block, ProgramVariable, Run } from '../types'

const defs = Object.values(FILLABLE_DEFINITIONS)

function usedVariables(blocks: Block[]): Set<ProgramVariable> {
  const used = new Set<ProgramVariable>()
  const scanRuns = (runs: Run[]) => runs.forEach(r => { if (r.t === 'var') used.add(r.name) })
  for (const b of blocks) {
    if (b.b === 'heading' || b.b === 'paragraph' || b.b === 'check') scanRuns(b.runs)
  }
  return used
}

function allKeys(blocks: Block[]): string[] {
  const keys: string[] = []
  for (const b of blocks) {
    if (b.b === 'heading' || b.b === 'paragraph') {
      b.runs.forEach(r => { if (r.t === 'blank') keys.push(r.key) })
    } else if (b.b === 'field' || b.b === 'radio' || b.b === 'check' || b.b === 'signature') {
      keys.push(b.key)
    }
  }
  return keys
}

describe('fillable definitions', () => {
  it('registry has exactly the four standard keys', () => {
    expect(Object.keys(FILLABLE_DEFINITIONS).sort()).toEqual(['absence', 'decharge', 'famille', 'medical'])
  })

  it.each(defs.map(d => [d.key, d] as const))('%s: keys are unique', (_k, def) => {
    const keys = allKeys(def.blocks)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(defs.map(d => [d.key, d] as const))('%s: declared variables match used variables', (_k, def) => {
    const used = usedVariables(def.blocks)
    expect([...used].sort()).toEqual([...def.variables].sort())
  })

  it.each(defs.map(d => [d.key, d] as const))('%s: requireOneOf keys exist', (_k, def) => {
    const keys = new Set(allKeys(def.blocks))
    for (const rule of def.requireOneOf ?? []) {
      for (const key of rule.keys) expect(keys.has(key)).toBe(true)
    }
  })

  it('every definition has at least one signature, and every signature is required (no optional signatory)', () => {
    for (const def of defs) {
      const sigs = def.blocks.filter(b => b.b === 'signature')
      expect(sigs.length).toBeGreaterThan(0)
      for (const sig of sigs) {
        expect(sig.b === 'signature' && sig.required).toBe(true)
      }
    }
  })

  it('no straight apostrophes in French text (typographic ’ only)', () => {
    const scan = (runs: Run[]) => runs.forEach(r => {
      if (r.t === 'text') expect(r.text).not.toMatch(/'/)
    })
    for (const def of defs) {
      for (const b of def.blocks) {
        if (b.b === 'heading' || b.b === 'paragraph' || b.b === 'check') scan(b.runs)
      }
    }
  })
})
