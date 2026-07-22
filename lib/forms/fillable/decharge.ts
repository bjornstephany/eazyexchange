// Décharge de responsabilité + code de conduite de l’élève.
// Source: docs/exampleSchoolFiles/Decharge de Responsabilite.pdf
import type { FillableDefinition } from './types'

export const decharge: FillableDefinition = {
  key: 'decharge',
  title: 'Décharge de responsabilité / code de conduite',
  variables: [
    'exchange_name', 'association_name', 'destination',
    'chaperones_et', 'chaperones_ou', 'travel_period', 'receiving_school_name',
    'sending_city',
  ],
  requireOneOf: [],
  blocks: [
    { b: 'heading', level: 2, runs: [{ t: 'text', text: 'ÉCHANGE : ' }, { t: 'var', name: 'exchange_name' }] },
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'DÉCHARGE DE RESPONSABILITÉ' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nous, soussignés ' },
      { t: 'blank', key: 'parent1_name', label: 'Nom du représentant légal 1' },
      { t: 'text', text: ' et ' },
      { t: 'blank', key: 'parent2_name', label: 'Nom du représentant légal 2' },
      { t: 'text', text: ', parents (ou responsables légaux) de ' },
      { t: 'blank', key: 'student_name', label: 'Nom de l’élève', prefill: 'student_name' },
      { t: 'text', text: ', reconnaissons que l’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' est simple facilitatrice de l’échange culturel et linguistique entre familles auquel nous autorisons notre enfant à participer. Destination : ' },
      { t: 'var', name: 'destination' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Par conséquent nous certifions décharger de toute responsabilité l’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' et ses membres ainsi que les accompagnateurs, ' },
      { t: 'var', name: 'chaperones_et' },
      { t: 'text', text: ', en cas d’accident, de vol de quelque nature que ce soit ou autre dommage causé par le mineur ci-dessus mentionné, ou par autrui à son encontre, pendant toute la durée du voyage, soit ' },
      { t: 'var', name: 'travel_period' },
      { t: 'text', text: '. Conscients des responsabilités que la participation à ce voyage implique, nous renonçons à tout recours contre l’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ', contre les membres de son bureau ou contre ' },
      { t: 'var', name: 'chaperones_ou' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Fait à ' },
      { t: 'var', name: 'sending_city' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: 'Signature des représentants légaux précédée de la mention « Lu et approuvé »' },
    ] },
    { b: 'signature', key: 'sig_parent1', roleLabel: 'Représentant légal 1', required: true },
    { b: 'signature', key: 'sig_parent2', roleLabel: 'Représentant légal 2', required: true },
    { b: 'divider' },
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'CODE DE CONDUITE de l’élève' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Je soussigné(e) ' },
      { t: 'blank', key: 'conduct_student_name', label: 'Nom de l’élève', prefill: 'student_name' },
      { t: 'text', text: ' m’engage à respecter le Règlement Général de l’établissement d’accueil, ' },
      { t: 'var', name: 'receiving_school_name' },
      { t: 'text', text: ', et à avoir une conduite respectueuse et irréprochable envers la famille d’accueil et ' },
      { t: 'var', name: 'chaperones_et' },
      { t: 'text', text: '.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: 'Signature du mineur précédée de la mention « Lu et approuvé »' },
    ] },
    { b: 'signature', key: 'sig_student', roleLabel: 'Élève', required: true, prefill: 'student_name' },
  ],
}
