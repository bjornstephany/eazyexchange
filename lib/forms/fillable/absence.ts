// Demande d’absence du lycée pour la durée de l’échange.
// Source: docs/exampleSchoolFiles/Demande d'absence du Lycée.pdf
import type { FillableDefinition } from './types'

export const absence: FillableDefinition = {
  key: 'absence',
  title: 'Demande d’absence',
  variables: [
    'sending_city', 'today', 'receiving_school_name', 'destination',
    'travel_period', 'sending_school_name', 'proviseur_name', 'absence_dates',
  ],
  requireOneOf: [],
  blocks: [
    { b: 'paragraph', style: 'italic', runs: [
      { t: 'var', name: 'sending_city' }, { t: 'text', text: ', le ' }, { t: 'var', name: 'today' },
    ] },
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'Demande d’absence du Lycée' }] },
    { b: 'paragraph', runs: [{ t: 'text', text: 'Madame, Monsieur,' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Certains élèves du lycée, dont votre enfant, participent à un échange culturel et linguistique avec ' },
      { t: 'var', name: 'receiving_school_name' },
      { t: 'text', text: ' (' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: '), qui se tiendra ' },
      { t: 'var', name: 'travel_period' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Le lycée ' },
      { t: 'var', name: 'sending_school_name' },
      { t: 'text', text: ' n’est pas organisateur du séjour. Aucun enseignant n’est chargé d’assumer la responsabilité des élèves sur place. Des accompagnateurs, à titre personnel, accompagneront les élèves.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je vous demande donc de bien vouloir compléter l’autorisation d’absence ci-dessous.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: 'Pour le Proviseur, ' }, { t: 'var', name: 'proviseur_name' },
    ] },
    { b: 'divider' },
    { b: 'heading', level: 2, runs: [
      { t: 'text', text: 'ÉCHANGE LINGUISTIQUE ' },
      { t: 'var', name: 'travel_period' },
      { t: 'text', text: ' — ' },
      { t: 'var', name: 'destination' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je soussigné(e) ' },
      { t: 'blank', key: 'parent_name', label: 'Nom du parent / responsable légal' },
      { t: 'text', text: ', responsable de l’élève ' },
      { t: 'blank', key: 'student_name', label: 'Nom de l’élève', prefill: 'student_name' },
      { t: 'text', text: ', demande que mon enfant soit excusé(e) pour son absence en cours ' },
      { t: 'var', name: 'absence_dates' },
      { t: 'text', text: '. Il/elle participe à l’échange linguistique (' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: ').' },
    ] },
    { b: 'radio', key: 'regime', label: 'Régime de l’élève', options: ['demi-pensionnaire', 'externe', 'interne'], required: true },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'var', name: 'sending_city' },
      { t: 'text', text: '.' },
    ] },
    { b: 'signature', key: 'sig_parent', roleLabel: 'Parent / responsable légal', required: true },
  ],
}
