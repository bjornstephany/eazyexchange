// lib/legal/cgu.ts
import type { LegalDocument } from './types'

export const cgu: LegalDocument = {
  slug: 'cgu',
  title: 'Conditions Générales d’Utilisation',
  lastUpdated: '2026-07-20',
  intro:
    'Les présentes Conditions Générales d’Utilisation (« CGU ») régissent l’accès et l’utilisation du site et de l’application Eazyexchange (« le Service »). En utilisant le Service, l’utilisateur accepte sans réserve les présentes CGU.',
  sections: [
    {
      id: 'objet',
      heading: '1. Objet',
      blocks: [
        {
          t: 'p',
          text: 'Le Service est un outil en ligne destiné aux organisateurs d’échanges scolaires pour collecter, suivre et gérer les candidatures, formulaires et documents des élèves et de leurs responsables légaux, ainsi qu’à ces derniers pour y répondre.',
        },
      ],
    },
    {
      id: 'definitions',
      heading: '2. Définitions',
      blocks: [
        {
          t: 'ul',
          items: [
            '« Organisateur » : membre du personnel d’un établissement scolaire qui crée un compte, configure un échange et invite des élèves.',
            '« Élève / Responsable légal » : personne invitée par un Organisateur à compléter des formulaires et téléverser des documents.',
            '« Établissement » : le lycée ou collège rattaché à un ou plusieurs Organisateurs.',
            '« Échange » : un programme nommé reliant deux établissements.',
          ],
        },
      ],
    },
    {
      id: 'acces-compte',
      heading: '3. Accès et compte',
      blocks: [
        {
          t: 'p',
          text: 'Les Organisateurs créent librement un compte sur la page d’inscription ; la création du compte vaut création de l’établissement associé. Les élèves et responsables légaux accèdent au Service uniquement sur invitation d’un Organisateur : aucune inscription libre n’est possible pour eux.',
        },
        {
          t: 'p',
          text: 'L’utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte.',
        },
      ],
    },
    {
      id: 'usage-acceptable',
      heading: '4. Usage acceptable',
      blocks: [
        {
          t: 'p',
          text: 'L’utilisateur s’engage à utiliser le Service conformément à sa destination et à la loi. Il s’interdit notamment de :',
        },
        {
          t: 'ul',
          items: [
            'porter atteinte au fonctionnement, à la sécurité ou à l’intégrité du Service ;',
            'tenter d’accéder à des données ne le concernant pas ;',
            'téléverser des contenus illicites, diffamatoires ou portant atteinte aux droits de tiers ;',
            'utiliser le Service à des fins de prospection non sollicitée.',
          ],
        },
      ],
    },
    {
      id: 'contenus-donnees',
      heading: '5. Contenus et données',
      blocks: [
        {
          t: 'p',
          text: 'L’Organisateur est responsable des données qu’il collecte via le Service et des finalités de cette collecte. L’éditeur agit en qualité de sous-traitant au sens du RGPD pour le compte de l’établissement. Le traitement des données personnelles est détaillé dans la Politique de confidentialité.',
        },
      ],
    },
    {
      id: 'propriete-intellectuelle',
      heading: '6. Propriété intellectuelle',
      blocks: [
        {
          t: 'p',
          text: 'Le Service, sa marque, son logo et son code demeurent la propriété exclusive de l’éditeur. Les contenus téléversés par les utilisateurs restent leur propriété ; ils concèdent à l’éditeur une licence limitée d’hébergement et de traitement strictement nécessaire au fonctionnement du Service.',
        },
      ],
    },
    {
      id: 'responsabilite',
      heading: '7. Responsabilité',
      blocks: [
        {
          t: 'p',
          text: 'Le Service est fourni « en l’état ». L’éditeur met en œuvre les moyens raisonnables pour en assurer la disponibilité et la sécurité, sans garantie d’absence d’interruption ou d’erreur. L’éditeur n’est pas partie à l’échange scolaire organisé entre les familles et établissements et ne saurait être tenu responsable de son déroulement.',
        },
      ],
    },
    {
      id: 'mineurs',
      heading: '8. Mineurs',
      blocks: [
        {
          t: 'p',
          text: 'Le Service traite des données relatives à des élèves mineurs. Ces données sont saisies sous la responsabilité des responsables légaux et de l’établissement organisateur. L’éditeur les traite avec un niveau de protection renforcé et ne les utilise à aucune autre fin que le fonctionnement du Service.',
        },
      ],
    },
    {
      id: 'suspension-resiliation',
      heading: '9. Suspension et résiliation',
      blocks: [
        {
          t: 'p',
          text: 'L’éditeur peut suspendre ou résilier l’accès d’un utilisateur en cas de manquement aux présentes CGU. L’Organisateur peut à tout moment cesser d’utiliser le Service ; les conditions de facturation applicables figurent dans les Conditions Générales de Vente.',
        },
      ],
    },
    {
      id: 'droit-applicable',
      heading: '10. Droit applicable et litiges',
      blocks: [
        {
          t: 'p',
          text: 'Les présentes CGU sont soumises au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français sont compétents dans les conditions prévues par la loi.',
        },
      ],
    },
    {
      id: 'modification',
      heading: '11. Modification des CGU',
      blocks: [
        {
          t: 'p',
          text: 'L’éditeur peut modifier les présentes CGU à tout moment. La version applicable est celle en vigueur à la date d’utilisation du Service ; la date de dernière mise à jour figure en tête du présent document.',
        },
      ],
    },
  ],
}
