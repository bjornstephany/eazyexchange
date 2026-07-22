// Engagement de la famille : conditions pour participer à un échange.
// Source: docs/exampleSchoolFiles/ENGAGEMENT DE FAMILLE.pdf
import type { FillableDefinition } from './types'

export const engagement: FillableDefinition = {
  key: 'famille',
  title: 'Engagement de famille',
  variables: ['association_name', 'sending_school_name'],
  requireOneOf: [],
  blocks: [
    { b: 'heading', level: 1, runs: [
      { t: 'text', text: 'ENGAGEMENT DE LA FAMILLE : CONDITIONS POUR PARTICIPER À UN ÉCHANGE ' },
      { t: 'var', name: 'association_name' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [
      { t: 'text', text: '1. Être membre ' }, { t: 'var', name: 'association_name' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [{ t: 'text', text: '2. L’élève :' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– À l’étranger, il s’engage à avoir un comportement exemplaire lors de son séjour en famille et dans l’établissement scolaire et pendant le voyage, et il fait l’effort de s’intégrer dans la famille d’accueil et d’accepter les différences culturelles.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– En France, il s’engage à parler français avec son correspondant et à l’intégrer dans son quotidien.' },
    ] },
    { b: 'paragraph', style: 'bold', runs: [{ t: 'text', text: '3. Les parents :' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– Ils assument la responsabilité totale et entière de la participation de leur enfant à un échange ainsi que de l’accueil de son correspondant étranger. L’association ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' et le lycée ' },
      { t: 'var', name: 'sending_school_name' },
      { t: 'text', text: ' ne font que faciliter un échange entre les familles et ne peuvent être tenus comme responsables.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– Les échanges proposés demandent donc un engagement familial important. Ils ne sont pas considérés comme des échanges scolaires mais comme des échanges linguistiques privés.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: '– En famille, ils s’engagent à parler français avec le correspondant et à régler ses frais d’accueil.' },
    ] },
    { b: 'check', key: 'accept_conditions', required: true, runs: [
      { t: 'text', text: 'Nous attestons avoir pris connaissance et accepter les conditions des échanges.' },
    ] },
    { b: 'check', key: 'accept_responsibility', required: true, runs: [
      { t: 'text', text: 'Nous en acceptons aussi la responsabilité.' },
    ] },
    { b: 'check', key: 'wish_participation', required: true, runs: [
      { t: 'text', text: 'Nous souhaitons que notre fils / notre fille participe à cet échange.' },
    ] },
    { b: 'check', key: 'accept_committee', required: true, runs: [
      { t: 'text', text: 'Nous comprenons qu’il y a peu de places et acceptons la décision du comité des échanges, qui s’effectue de manière collégiale entre les responsables de ' },
      { t: 'var', name: 'association_name' },
      { t: 'text', text: ' et les professeurs.' },
    ] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'Nom, prénom de l’élève : ' },
      { t: 'blank', key: 'student_name', label: 'Nom, prénom de l’élève', prefill: 'student_name' },
    ] },
    { b: 'signature', key: 'sig_pere', roleLabel: 'Père', required: true },
    { b: 'signature', key: 'sig_mere', roleLabel: 'Mère', required: true },
    { b: 'signature', key: 'sig_eleve', roleLabel: 'Élève', required: true, prefill: 'student_name' },
    { b: 'paragraph', style: 'italic', runs: [
      { t: 'text', text: 'Le résultat de la sélection sera communiqué par mail à chaque famille.' },
    ] },
  ],
}
