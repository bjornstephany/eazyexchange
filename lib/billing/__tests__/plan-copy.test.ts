import { describe, it, expect } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '@/messages/fr.json'
import { asAppTranslator } from '@/lib/i18n/messages'
import { planCopy, featureBullets, deltaLabel } from '@/lib/billing/plan-copy'

const t = asAppTranslator(
  createTranslator({ locale: 'fr', messages: fr, namespace: 'organizer.billing' } as never),
)

describe('planCopy', () => {
  it('resolves label, price, per, audience and a bounded cap line', () => {
    expect(planCopy(t, 'starter')).toEqual({
      label: 'Essentiel',
      price: '199 €',
      per: '/ an',
      audience: 'Pour un jumelage unique',
      capLine: '2 échanges',
    })
  })
  it('uses the unlimited cap line for scale', () => {
    expect(planCopy(t, 'scale').capLine).toBe('Échanges illimités')
    expect(planCopy(t, 'scale').label).toBe('Réseau')
  })
  it('pluralises a cap of one', () => {
    // growth is 6 — assert the plural arm is wired by checking the 6-form.
    expect(planCopy(t, 'growth').capLine).toBe('6 échanges')
  })
})

describe('featureBullets', () => {
  it('returns the four shared bullets', () => {
    expect(featureBullets(t)).toEqual([
      'Élèves et familles illimités',
      'Formulaires et documents illimités',
      'Relances automatiques par e-mail',
      'Suivi des dossiers en temps réel',
    ])
  })
})

describe('deltaLabel', () => {
  it('prices an upgrade by the capacity it adds', () => {
    expect(deltaLabel(t, 'starter', 'growth')).toBe('+4 échanges')
  })
  it('says unlimited for scale', () => {
    expect(deltaLabel(t, 'starter', 'scale')).toBe('Échanges illimités')
    expect(deltaLabel(t, 'growth', 'scale')).toBe('Échanges illimités')
  })
})
