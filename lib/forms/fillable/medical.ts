// Medical authorisation / autorisation médicale — bilingual EN/FR (read by
// the US host family). Source: docs/exampleSchoolFiles/Medical Authorisation.pdf
import type { FillableDefinition } from './types'

export const medical: FillableDefinition = {
  key: 'medical',
  title: 'Autorisation médicale',
  variables: ['chaperones_or_en', 'chaperones_ou', 'travel_period_en'],
  // Both parent signatures are required (a two-signature form needs two
  // signatures). The phone rule stays "at least one" — contact fields, not
  // signatures.
  requireOneOf: [
    { keys: ['mother_phone', 'father_phone'], message: 'Indiquez au moins un numéro de téléphone d’urgence.' },
  ],
  blocks: [
    { b: 'heading', level: 1, runs: [{ t: 'text', text: 'MEDICAL AUTHORISATION' }] },
    { b: 'heading', level: 2, runs: [{ t: 'text', text: 'Autorisation médicale' }] },
    { b: 'paragraph', runs: [
      { t: 'text', text: 'We hereby authorize ' },
      { t: 'blank', key: 'host_family', label: 'Host family (if known) / Famille d’accueil (si connue)', required: false },
      { t: 'text', text: ', the host family, and/or French chaperones, ' },
      { t: 'var', name: 'chaperones_or_en' },
      { t: 'text', text: ', to: (1) administer first aid treatment and (2) give permission and consent for any and all emergency medical care and procedures deemed necessary regarding the medical treatment of our child ' },
      { t: 'blank', key: 'child_name', label: 'Child’s name / Nom de l’enfant', prefill: 'student_name' },
      { t: 'text', text: ' in the event that we cannot be reached by telephone ' },
      { t: 'var', name: 'travel_period_en' },
      { t: 'text', text: '. We further undertake to pay all medical bills and costs incurred.' },
    ] },
    { b: 'paragraph', style: 'italic', runs: [
      { t: 'text', text: 'Nous, soussignés, autorisons la famille d’accueil nommée ci-dessus et ' },
      { t: 'var', name: 'chaperones_ou' },
      { t: 'text', text: ' : (1) à administrer les premiers soins et (2) à agir en notre nom pour tout soin ou toute intervention d’urgence à l’égard de notre enfant nommé ci-dessus, au cas où nous ne serions pas joignables par téléphone. Nous nous engageons à les dédommager de toute facture médicale encourue.' },
    ] },
    { b: 'heading', level: 2, runs: [{ t: 'text', text: 'Emergency Contact Telephone Numbers / Numéros d’urgence' }] },
    { b: 'field', key: 'mother_phone', label: 'Mother’s mobile number / Portable de la mère', input: 'phone', required: false, prefix: '0 11 33' },
    { b: 'field', key: 'father_phone', label: 'Father’s mobile number / Portable du père', input: 'phone', required: false, prefix: '0 11 33' },
    { b: 'field', key: 'medical_needs', label: 'Special medical needs/allergies/restrictions/diet — Contre-indications / allergies / restrictions / régime particuliers', input: 'textarea', required: false },
    { b: 'signature', key: 'sig_father', roleLabel: 'Father / Père', required: true },
    { b: 'signature', key: 'sig_mother', roleLabel: 'Mother / Mère', required: true },
  ],
}
