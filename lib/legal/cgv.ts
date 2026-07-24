// lib/legal/cgv.ts
import type { LegalDocument } from './types'

export const cgv: LegalDocument = {
  slug: 'cgv',
  draft: true,
  title: 'Conditions Générales de Vente',
  lastUpdated: '2026-07-20',
  intro:
    'Les présentes Conditions Générales de Vente (« CGV ») régissent la souscription aux offres payantes du Service Eazyexchange par les Organisateurs agissant dans le cadre de leur activité professionnelle ou de celle de leur établissement.',
  sections: [
    {
      id: 'objet',
      heading: '1. Objet et champ d’application',
      blocks: [
        {
          t: 'p',
          text: 'Les présentes CGV définissent les conditions de souscription, de facturation et de résiliation des offres payantes. Elles complètent les Conditions Générales d’Utilisation, qui restent applicables.',
        },
      ],
    },
    {
      id: 'offres-prix',
      heading: '2. Offres et prix',
      blocks: [
        {
          t: 'p',
          text: 'L’abonnement est rattaché à l’établissement. Le nombre d’échanges autorisés dépend de l’offre :',
        },
        {
          t: 'ul',
          items: [
            'Essai gratuit : 1 échange, sans carte bancaire ;',
            'Essentiel : 2 échanges — 199 € / an ;',
            'Association : 6 échanges — 399 € / an ;',
            'Réseau : échanges illimités — 599 € / an.',
          ],
        },
        {
          t: 'p',
          text: 'Les prix sont indiqués [PLACEHOLDER : hors taxes ou toutes taxes comprises]. La TVA applicable est celle en vigueur à la date de facturation.',
        },
      ],
    },
    {
      id: 'souscription',
      heading: '3. Souscription',
      blocks: [
        {
          t: 'p',
          text: 'Aucune carte bancaire n’est demandée à l’inscription. L’Organisateur souscrit à une offre payante depuis la page « Offres & facturation » du Service. La souscription est effective dès la validation du paiement.',
        },
      ],
    },
    {
      id: 'paiement',
      heading: '4. Paiement',
      blocks: [
        {
          t: 'p',
          text: 'Les paiements sont traités par notre prestataire Stripe. L’éditeur ne conserve aucune donnée bancaire. La facturation est annuelle et l’abonnement est renouvelé automatiquement à l’échéance, sauf résiliation.',
        },
      ],
    },
    {
      id: 'duree-renouvellement',
      heading: '5. Durée et renouvellement',
      blocks: [
        {
          t: 'p',
          text: 'L’abonnement est souscrit pour la période choisie et se renouvelle tacitement pour des périodes de même durée, jusqu’à résiliation par l’Organisateur.',
        },
      ],
    },
    {
      id: 'retractation',
      heading: '6. Droit de rétractation',
      blocks: [
        {
          t: 'p',
          text: '[PLACEHOLDER : clause de rétractation à valider par un conseil juridique. La souscription s’adressant à des professionnels / établissements, le régime de rétractation applicable aux consommateurs peut ne pas s’appliquer ; préciser ici le régime retenu.]',
        },
      ],
    },
    {
      id: 'resiliation-remboursement',
      heading: '7. Résiliation et remboursement',
      blocks: [
        {
          t: 'p',
          text: 'L’Organisateur peut résilier son abonnement à tout moment depuis l’espace de facturation ; la résiliation prend effet à la fin de la période en cours. Sauf disposition légale contraire, les sommes versées au titre de la période en cours ne sont pas remboursées.',
        },
      ],
    },
    {
      id: 'defaut-paiement',
      heading: '8. Défaut de paiement',
      blocks: [
        {
          t: 'p',
          text: 'En cas d’échec de paiement, l’accès aux fonctionnalités payantes peut être suspendu à l’issue d’une période de tolérance. Les données déjà collectées restent conservées conformément à la Politique de confidentialité.',
        },
      ],
    },
    {
      id: 'modification-tarifs',
      heading: '9. Modification des tarifs',
      blocks: [
        {
          t: 'p',
          text: 'L’éditeur peut modifier ses tarifs. Toute modification est sans effet sur la période d’abonnement en cours et s’applique au renouvellement suivant, après information préalable de l’Organisateur.',
        },
      ],
    },
    {
      id: 'droit-applicable',
      heading: '10. Droit applicable et litiges',
      blocks: [
        {
          t: 'p',
          text: 'Les présentes CGV sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français sont compétents dans les conditions prévues par la loi.',
        },
      ],
    },
  ],
}
