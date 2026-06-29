export type AppFieldType = 'text' | 'textarea' | 'date' | 'email' | 'tel' | 'yesno' | 'radio'

export interface AppField {
  id: string
  type: AppFieldType
  label: { en: string; fr: string }
  required?: boolean
  group?: 'father' | 'mother'
  options?: { value: string; label: { en: string; fr: string } }[]
}

export interface AppSection {
  id: string
  title: { en: string; fr: string }
  fields: AppField[]
}

const L = (en: string, fr: string) => ({ en, fr })

export const APPLICATION_SECTIONS: AppSection[] = [
  {
    id: 'student',
    title: L('Student', 'Élève'),
    fields: [
      { id: 'last_name', type: 'text', label: L('Last name', 'Nom'), required: true },
      { id: 'first_name', type: 'text', label: L('First name', 'Prénom'), required: true },
      { id: 'native_language', type: 'text', label: L('Native language', 'Langue maternelle') },
      { id: 'nationality', type: 'text', label: L('Nationality(ies)', 'Nationalité(s)') },
      { id: 'date_of_birth', type: 'date', label: L('Date of birth', 'Date de naissance'), required: true },
      { id: 'sex', type: 'text', label: L('Sex', 'Sexe') },
      { id: 'pronouns', type: 'text', label: L('Pronouns', 'Pronoms') },
      { id: 'grade', type: 'text', label: L('Grade in 26-27', 'Niveau 26-27') },
      { id: 'french_class', type: 'text', label: L('French class in 26-27', 'Classe de français 26-27') },
      { id: 'email', type: 'email', label: L('E-mail', 'E-mail'), required: true },
      { id: 'cell_phone', type: 'tel', label: L('Cell phone', 'Téléphone portable') },
    ],
  },
  {
    id: 'parents',
    title: L('Parents', 'Parents'),
    fields: [
      { id: 'father_last_name', type: 'text', group: 'father', label: L('Father — Last name', 'Père — Nom') },
      { id: 'father_first_name', type: 'text', group: 'father', label: L('Father — First name', 'Père — Prénom') },
      { id: 'father_nationality', type: 'text', group: 'father', label: L('Father — Nationality(ies)', 'Père — Nationalité(s)') },
      { id: 'father_native_language', type: 'text', group: 'father', label: L('Father — Native language', 'Père — Langue maternelle') },
      { id: 'father_cell_phone', type: 'tel', group: 'father', label: L('Father — Cell phone', 'Père — Téléphone portable') },
      { id: 'father_email', type: 'email', group: 'father', label: L('Father — Email', 'Père — Email') },
      { id: 'father_address', type: 'textarea', group: 'father', label: L('Father — Address', 'Père — Adresse') },
      { id: 'father_occupation', type: 'text', group: 'father', label: L('Father — Occupation', 'Père — Profession') },
      { id: 'mother_last_name', type: 'text', group: 'mother', label: L('Mother — Last name', 'Mère — Nom') },
      { id: 'mother_first_name', type: 'text', group: 'mother', label: L('Mother — First name', 'Mère — Prénom') },
      { id: 'mother_nationality', type: 'text', group: 'mother', label: L('Mother — Nationality(ies)', 'Mère — Nationalité(s)') },
      { id: 'mother_native_language', type: 'text', group: 'mother', label: L('Mother — Native language', 'Mère — Langue maternelle') },
      { id: 'mother_cell_phone', type: 'tel', group: 'mother', label: L('Mother — Cell phone', 'Mère — Téléphone portable') },
      { id: 'mother_email', type: 'email', group: 'mother', label: L('Mother — Email', 'Mère — Email') },
      { id: 'mother_address', type: 'textarea', group: 'mother', label: L('Mother — Address', 'Mère — Adresse') },
      { id: 'mother_occupation', type: 'text', group: 'mother', label: L('Mother — Occupation', 'Mère — Profession') },
      {
        id: 'family_status', type: 'radio',
        label: L('Family status', 'Situation familiale'),
        options: [
          { value: 'married', label: L('Married', 'Marié') },
          { value: 'separated', label: L('Separated', 'Séparé') },
          { value: 'step_family', label: L('Step-family', 'Famille recomposée') },
        ],
      },
      { id: 'separation_housing_address', type: 'textarea', label: L('If separated, address where the exchange student will be housed', 'En cas de séparation, adresse où sera accueilli le correspondant') },
    ],
  },
  {
    id: 'hosting',
    title: L('Hosting conditions', "Conditions d'accueil"),
    fields: [
      { id: 'brothers_at_home', type: 'text', label: L('# brothers at home (list ages)', '# frères à la maison (précisez âge)') },
      { id: 'sisters_at_home', type: 'text', label: L('# sisters at home (list ages)', '# sœurs à la maison (précisez âge)') },
      { id: 'pets', type: 'text', label: L('Animals in the home', 'Animaux domestiques') },
      { id: 'food_requirements', type: 'textarea', label: L('Food allergies or requirements', 'Spécificités alimentaires') },
      { id: 'other_allergies', type: 'textarea', label: L('Other allergies', 'Autres allergies') },
      { id: 'main_language_home', type: 'text', label: L('Main language spoken at home', 'Langue principale parlée en famille') },
      { id: 'other_languages_home', type: 'text', label: L('Other languages spoken at home', 'Autres langues parlées en famille') },
      { id: 'smoking_home', type: 'yesno', label: L('Does anyone smoke in the home?', 'Fume-t-on à la maison ?') },
      { id: 'own_room', type: 'yesno', label: L('Will the exchange student have their own room?', 'Chambre individuelle pour le correspondant ?') },
      { id: 'accept_opposite_sex', type: 'yesno', label: L('Would you accept an exchange student of the opposite sex?', 'Accepteriez-vous un échange mixte ?') },
    ],
  },
  {
    id: 'profile',
    title: L('Student profile', "Profil de l'élève"),
    fields: [
      { id: 'lived_abroad', type: 'textarea', label: L('If you have ever lived abroad, describe where and when', "Si vous avez déjà vécu à l'étranger, décrivez où et quand") },
      { id: 'countries_with_parents', type: 'textarea', label: L('Which countries have you visited with your parents?', 'Quels pays avez-vous visités avec vos parents ?') },
      { id: 'countries_without_parents', type: 'textarea', label: L('Which countries have you visited without your parents, and for how long?', 'Quels pays avez-vous visités sans vos parents, et combien de temps ?') },
      { id: 'sports', type: 'textarea', label: L('Sports you do and hours per week', 'Sports pratiqués et heures par semaine') },
      { id: 'activities', type: 'textarea', label: L('After-school activities, clubs, or hobbies and hours per week', 'Activités, clubs ou loisirs et heures par semaine') },
      { id: 'instruments', type: 'textarea', label: L('Do you play any instrument or sing?', "Jouez-vous d'un instrument ou chantez-vous ?") },
      { id: 'family_activities', type: 'textarea', label: L('Weekend/holiday family activities', 'Activités familiales le week-end / pendant les vacances') },
      { id: 'spare_time', type: 'textarea', label: L('What do you like to do most in your spare time?', 'Que préférez-vous faire pendant votre temps libre ?') },
      { id: 'adjectives', type: 'textarea', label: L('Three adjectives a close friend would use to describe you', "Trois adjectifs qu'un ami proche utiliserait pour vous décrire") },
      { id: 'recharge', type: 'textarea', label: L('How do you recharge — around people or solo? Explain', 'Comment vous ressourcez-vous — entouré ou seul ? Expliquez') },
      { id: 'todo_list', type: 'textarea', label: L('Three items on your life "to-do" list', 'Trois choses sur votre liste de choses à faire dans la vie') },
      { id: 'ideal_partner', type: 'textarea', label: L('What would your ideal exchange partner be like?', 'Comment serait votre correspondant idéal ?') },
      { id: 'share_when_hosting', type: 'textarea', label: L('What would you like to share with your partner when hosting?', "Que souhaiteriez-vous partager avec votre correspondant en l'accueillant ?") },
      { id: 'anything_else', type: 'textarea', label: L('Anything else you would like to add?', 'Souhaitez-vous ajouter autre chose ?') },
    ],
  },
]

export function allApplicationFields(): AppField[] {
  return APPLICATION_SECTIONS.flatMap(s => s.fields)
}

export function requiredApplicationFieldIds(): string[] {
  return allApplicationFields().filter(f => f.required).map(f => f.id)
}

export function missingRequiredApplication(data: Record<string, string>): string[] {
  return requiredApplicationFieldIds().filter(id => (data[id] ?? '').trim() === '')
}
