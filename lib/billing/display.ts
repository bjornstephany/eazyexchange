// Single source for customer-facing plan display (labels, € prices, blurbs).
// Keys stay starter/growth/scale — only display is French (Réglages design).
import { PLAN_EXCHANGE_CAP } from './limits'
import type { PlanKey } from './plans'
import { p } from '@/lib/dashboard/rollup'

export const PLAN_LABEL_FR: Record<PlanKey, string> = {
  starter: 'Essentiel', growth: 'Association', scale: 'Réseau',
}
export const PLAN_PRICE_FR: Record<PlanKey, string> = {
  starter: '199 €', growth: '399 €', scale: '599 €',
}
export const PLAN_DESC_FR: Record<PlanKey, string> = {
  starter: 'Pour un organisateur indépendant.',
  growth: 'Pour les associations en pleine croissance.',
  scale: 'Pour les grands réseaux d’échanges.',
}
// Audience line shown on each plan card (semibold, under the cap).
export const PLAN_AUDIENCE_FR: Record<PlanKey, string> = {
  starter: 'Pour un jumelage unique',
  growth: 'Pour plusieurs programmes en parallèle',
  scale: 'Pour les grands établissements',
}

// Shared feature bullets — identical across plans (only the cap differs).
export const PLAN_FEATURE_BULLETS_FR: string[] = [
  'Élèves et familles illimités',
  'Formulaires et documents illimités',
  'Relances automatiques par e-mail',
  'Suivi des dossiers en temps réel',
]

export const TRIAL_LABEL = 'Essai gratuit'
export const TRIAL_PRICE = '0 €'
export const TRIAL_DESC = 'Votre premier échange est offert — aucun paiement requis.'

export function planCapLabel(key: PlanKey): string {
  const cap = PLAN_EXCHANGE_CAP[key]
  return cap === Infinity ? 'Échanges illimités' : `${cap} échanges`
}

export function usageLine(used: number, cap: number): { label: string; pct: number } {
  if (cap === Infinity) {
    return { label: `${used} échange${p(used)} actif${p(used)} · échanges illimités`, pct: 6 }
  }
  return {
    label: `${used} / ${cap} échange${p(cap)} utilisé${p(used)}`,
    pct: cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0,
  }
}
