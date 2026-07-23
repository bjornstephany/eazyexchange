import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { connect, runAs, writeOutcome, expectBlocked } from './db'
import { seedFixtures, cleanupFixtures, type Fixtures } from './seed'

const sql = connect()
let fx: Fixtures

// A deterministic row of our own, so the assertions do not depend on whether
// `pnpm sync:schools` has run against this database.
const UAI = 'RLSTEST1'

beforeAll(async () => {
  fx = await seedFixtures(sql)
  await sql`
    insert into school_registry
      (uai, name, type, status, commune, postal_code, search_name, search_text)
    values
      (${UAI}, 'Lycée RLS Test', 'Lycée', 'Public', 'Lyon', '69007',
       'lycee rls test', 'lycee rls test lyon 69007')`
})
afterAll(async () => {
  await sql`delete from school_registry where uai = ${UAI}`
  if (fx) await cleanupFixtures(sql, fx)
  await sql.end()
})

describe('school_registry (public open data, read-only for clients)', () => {
  it('anon can select — the picker runs before a school exists', async () => {
    const rows = await runAs(sql, null, (tx) =>
      tx`select uai, name from school_registry where uai = ${UAI}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Lycée RLS Test')
  })

  it('authenticated organizers and students can select too', async () => {
    for (const uid of [fx.orgA, fx.studentA]) {
      const rows = await runAs(sql, uid, (tx) =>
        tx`select uai from school_registry where uai = ${UAI}`)
      expect(rows, `persona ${uid}`).toHaveLength(1)
    }
  })

  it('no client role can insert a fake establishment', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`insert into school_registry
             (uai, name, type, commune, postal_code, search_name, search_text)
           values ('RLSFORGE', 'Faux Lycée', 'Lycée', 'Nulle Part', '00000', 'faux lycee', 'faux lycee')`))
    }
  })

  it('no client role can update a registry row', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`update school_registry set name = 'Renommé' where uai = ${UAI}`))
    }
  })

  it('no client role can delete a registry row', async () => {
    for (const uid of [null, fx.orgA, fx.studentA]) {
      expectBlocked(await writeOutcome(sql, uid, (tx) =>
        tx`delete from school_registry where uai = ${UAI}`))
    }
  })
})

describe('claim_school() — the only writer of schools.uai / schools.country', () => {
  it('an organizer claims a real establishment; the name comes from the registry', async () => {
    const name = await runAs(sql, fx.orgA, async (tx) => {
      const [row] = await tx`select claim_school('FR', ${UAI}, 'Nom Falsifié') as name`
      const [school] = await tx`select name, uai, country from schools where id = ${fx.schoolA}`
      expect(school.name).toBe('Lycée RLS Test')   // NOT 'Nom Falsifié'
      expect(school.uai).toBe(UAI)
      expect(school.country).toBe('FR')
      return row.name
    })
    expect(name).toBe('Lycée RLS Test')
  })

  it('an unknown UAI is rejected and writes nothing', async () => {
    await runAs(sql, fx.orgA, async (tx) => {
      const before = await tx`select name from schools where id = ${fx.schoolA}`
      const [row] = await tx`select claim_school('FR', 'NOSUCHUAI', 'Nom Falsifié') as name`
      expect(row.name).toBeNull()
      const after = await tx`select name, uai from schools where id = ${fx.schoolA}`
      expect(after[0].name).toBe(before[0].name)
      expect(after[0].uai).toBeNull()
    })
  })

  it('a non-FR claim stores the typed name with a null uai', async () => {
    await runAs(sql, fx.orgA, async (tx) => {
      const [row] = await tx`select claim_school('Canada', null, '  Collège Saint-Laurent  ') as name`
      expect(row.name).toBe('Collège Saint-Laurent')
      const [school] = await tx`select name, uai, country from schools where id = ${fx.schoolA}`
      expect(school.uai).toBeNull()
      expect(school.country).toBe('Canada')
    })
  })

  it('a non-FR claim with an empty name is rejected', async () => {
    await runAs(sql, fx.orgA, async (tx) => {
      const [row] = await tx`select claim_school('Canada', null, '   ') as name`
      expect(row.name).toBeNull()
    })
  })

  it('a student cannot claim a school', async () => {
    await runAs(sql, fx.studentA, async (tx) => {
      const [row] = await tx`select claim_school('FR', ${UAI}, null) as name`
      expect(row.name).toBeNull()
    })
  })

  it('anon cannot execute claim_school at all', async () => {
    let code: string | undefined
    try {
      await runAs(sql, null, (tx) => tx`select claim_school('FR', ${UAI}, null)`)
    } catch (e) {
      code = (e as { code?: string }).code
    }
    expect(code).toBe('42501')
  })

  it('an organizer still cannot write uai or country directly', async () => {
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update schools set country = 'XX' where id = ${fx.schoolA}`))
    expectBlocked(await writeOutcome(sql, fx.orgA, (tx) =>
      tx`update schools set uai = 'FORGED' where id = ${fx.schoolA}`))
  })
})
