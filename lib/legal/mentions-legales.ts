// lib/legal/mentions-legales.ts
import type { LegalDocument } from './types'

export const mentionsLegales: LegalDocument = {
  slug: 'mentions-legales',
  draft: true,
  title: 'Mentions légales',
  lastUpdated: '2026-07-20',
  intro:
    'Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique, les informations suivantes sont portées à la connaissance des utilisateurs du site et de l’application Eazyexchange.',
  sections: [
    {
      id: 'editeur',
      heading: 'Éditeur',
      blocks: [
        {
          t: 'p',
          text: 'Le site et l’application Eazyexchange sont édités par [PLACEHOLDER : dénomination sociale], [PLACEHOLDER : forme juridique] au capital de [PLACEHOLDER : montant] €, immatriculée au Registre du commerce et des sociétés de [PLACEHOLDER : ville] sous le numéro [PLACEHOLDER : SIREN].',
        },
        {
          t: 'ul',
          items: [
            'Siège social : [PLACEHOLDER : adresse]',
            'Numéro de TVA intracommunautaire : [PLACEHOLDER]',
            'Directeur de la publication : [PLACEHOLDER : nom]',
            'Contact : [PLACEHOLDER : adresse e-mail]',
          ],
        },
      ],
    },
    {
      id: 'hebergement',
      heading: 'Hébergement',
      blocks: [
        {
          t: 'p',
          text: 'L’application est hébergée par Vercel Inc., dont le siège est situé aux États-Unis ([PLACEHOLDER : adresse postale complète]).',
        },
        {
          t: 'p',
          text: 'La base de données, l’authentification et les fichiers téléversés sont hébergés par Supabase, Inc. ([PLACEHOLDER : adresse postale complète]), sur une infrastructure localisée dans l’Union européenne (région [PLACEHOLDER : région]).',
        },
      ],
    },
    {
      id: 'propriete-intellectuelle',
      heading: 'Propriété intellectuelle',
      blocks: [
        {
          t: 'p',
          text: 'L’ensemble des éléments du site et de l’application (marque, logo, textes, interface, code) est protégé par le droit de la propriété intellectuelle et demeure la propriété exclusive de l’éditeur, sauf mention contraire. Toute reproduction ou représentation, totale ou partielle, sans autorisation écrite préalable est interdite.',
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      blocks: [
        {
          t: 'p',
          text: 'Pour toute question relative au site ou à l’application, vous pouvez écrire à [PLACEHOLDER : adresse e-mail de contact].',
        },
      ],
    },
  ],
}
