// lib/legal/confidentialite.ts
import type { LegalDocument } from './types'

export const confidentialite: LegalDocument = {
  slug: 'confidentialite',
  draft: true,
  title: 'Politique de confidentialité',
  lastUpdated: '2026-07-20',
  intro:
    'La présente politique décrit comment Eazyexchange collecte et traite les données personnelles, conformément au Règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.',
  sections: [
    {
      id: 'responsable',
      heading: '1. Responsable du traitement',
      blocks: [
        {
          t: 'p',
          text: 'Le responsable du traitement des données de compte des Organisateurs est [PLACEHOLDER : dénomination sociale]. Pour les données des élèves et responsables légaux, l’établissement organisateur est responsable de traitement et l’éditeur agit comme sous-traitant.',
        },
      ],
    },
    {
      id: 'donnees-collectees',
      heading: '2. Données collectées',
      blocks: [
        {
          t: 'ul',
          items: [
            'Données de compte Organisateur : nom, adresse e-mail, établissement.',
            'Données des élèves et responsables légaux, incluant des données relatives à des mineurs : identité, coordonnées, réponses aux formulaires et documents téléversés.',
            'Données techniques strictement nécessaires au fonctionnement (session, journaux de sécurité).',
          ],
        },
      ],
    },
    {
      id: 'finalites',
      heading: '3. Finalités et bases légales',
      blocks: [
        {
          t: 'ul',
          items: [
            'Fourniture du Service et exécution du contrat (art. 6.1.b RGPD) ;',
            'Sécurité, prévention des abus et amélioration du Service (intérêt légitime, art. 6.1.f) ;',
            'Envoi de relances et notifications liées aux échanges (exécution du contrat / intérêt légitime).',
          ],
        },
      ],
    },
    {
      id: 'mineurs',
      heading: '4. Données relatives aux mineurs',
      blocks: [
        {
          t: 'p',
          text: 'Les données d’élèves mineurs sont saisies sous la responsabilité des responsables légaux et de l’établissement. Elles bénéficient d’un traitement à accès restreint et ne sont ni revendues, ni utilisées à des fins publicitaires.',
        },
      ],
    },
    {
      id: 'conservation',
      heading: '5. Durée de conservation',
      blocks: [
        {
          t: 'p',
          text: 'Les données sont conservées le temps nécessaire aux finalités, puis supprimées ou anonymisées selon le cycle de vie de conservation mis en œuvre par le Service. Un Organisateur peut demander l’export ou l’effacement des données d’un élève depuis le Service.',
        },
      ],
    },
    {
      id: 'destinataires',
      heading: '6. Destinataires et sous-traitants',
      blocks: [
        {
          t: 'p',
          text: 'Les données sont accessibles aux seuls Organisateurs habilités de l’établissement concerné. L’éditeur recourt aux sous-traitants suivants :',
        },
        {
          t: 'ul',
          items: [
            'Supabase — hébergement de la base de données, authentification et stockage des fichiers ;',
            'Vercel — hébergement de l’application ;',
            'Resend — envoi des e-mails transactionnels ;',
            'Stripe — traitement des paiements.',
          ],
        },
      ],
    },
    {
      id: 'transferts',
      heading: '7. Transferts hors Union européenne',
      blocks: [
        {
          t: 'p',
          text: 'Certains sous-traitants sont établis hors de l’Union européenne. [PLACEHOLDER : préciser les garanties encadrant ces transferts — clauses contractuelles types, localisation des données, etc.]',
        },
      ],
    },
    {
      id: 'droits',
      heading: '8. Vos droits',
      blocks: [
        {
          t: 'p',
          text: 'Conformément au RGPD, vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité. Ces droits s’exercent auprès de l’établissement organisateur ou, pour les données de compte, à l’adresse [PLACEHOLDER : e-mail]. Vous pouvez introduire une réclamation auprès de la CNIL.',
        },
      ],
    },
    {
      id: 'cookies',
      heading: '9. Cookies',
      blocks: [
        {
          t: 'p',
          text: 'Le Service n’utilise que des cookies strictement nécessaires à son fonctionnement (session et authentification). Aucun cookie publicitaire ou de mesure d’audience tierce n’est déposé.',
        },
      ],
    },
    {
      id: 'contact',
      heading: '10. Contact',
      blocks: [
        {
          t: 'p',
          text: 'Pour toute question relative à la protection des données, écrivez à [PLACEHOLDER : e-mail du délégué à la protection des données ou du contact RGPD].',
        },
      ],
    },
  ],
}
