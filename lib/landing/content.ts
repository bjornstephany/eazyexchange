import type { Locale } from '@/lib/i18n/config'

export type Lang = Locale

// Pill palette keys — mapped to the handoff hex pairs in the components.
export type PillTone = 'ok' | 'warn' | 'info' | 'bad' | 'mut'
export type FunnelKey = 'all' | 'complete' | 'pending' | 'review' | 'missing'

export interface Pill {
  label: string
  tone: PillTone
}

export interface SweepEmail {
  initials: string
  sender: string
  time: string
  subject: string
  preview?: string
  attachment?: string
}

export interface SliceRow {
  name: string
  key: Exclude<FunnelKey, 'all'>
  cells: [Pill, Pill, Pill, Pill]
  flagged?: boolean
}

export interface MatrixCell {
  label: string
  tone: PillTone
  ring?: boolean
}

export interface LandingContent {
  nav: { product: string; login: string; cta: string }
  hero: {
    eyebrow: string
    title: string
    sub: string
    ctaPrimary: string
    note: string
  }
  sweep: {
    beforeLabel: string
    inboxTitle: string
    unread: string
    emails: SweepEmail[]
    afterLabel: string
    results: { label: string; pill: Pill }[]
  }
  slice: {
    exchange: string
    phase: string
    funnel: { key: FunnelKey; label: string; count: number }[]
    cols: string[]
    rows: SliceRow[]
    footAll: string
    footMoreOne: string
    footMoreMany: string
    activityTitle: string
    activity: { time: string; text: string; ok?: boolean }[]
    todoTitle: string
    todoBody: string
    annotations: string[]
  }
  benefits: {
    blocks: { eyebrow: string; title: string; body: string }[]
    invite: {
      label: string
      chip: string
      more: string
      button: string
      students: { name: string; pct: number; done?: boolean }[]
    }
    reminders: {
      label: string
      toggle: string
      rows: { time: string; text: string; pill: Pill }[]
      note: string
    }
    matrix: {
      label: string
      done: string
      blocked: string
      cols: string[]
      rows: { name: string; cells: [MatrixCell, MatrixCell, MatrixCell, MatrixCell] }[]
      legend: { ok: string; warn: string; bad: string }
    }
  }
  savings: {
    eyebrow: string
    title: string
    p1: string
    p2: string
    cardTitle: string
    rows: { label: string; value: string; green?: boolean }[]
    totalLabel: string
    totalValue: string
  }
  closing: { title: string; cta: string; note: string }
  footer: { product: string; login: string; copyright: string }
}

const pill = (label: string, tone: PillTone): Pill => ({ label, tone })

const fr: LandingContent = {
  nav: { product: 'Produit', login: 'Se connecter', cta: 'Démarrer gratuitement' },
  hero: {
    eyebrow: 'Pour les organisateurs d’échanges scolaires',
    title: 'Arrêtez de courir après les documents de vos élèves',
    sub: 'Candidatures, formulaires et relances au même endroit. Votre premier échange est gratuit, sans installation.',
    ctaPrimary: 'Démarrer mon échange gratuit',
    note: 'Sans carte bancaire · vos élèves invités en 5 minutes',
  },
  sweep: {
    beforeLabel: 'Ce que vous recevez aujourd’hui',
    inboxTitle: 'Boîte de réception',
    unread: '47',
    emails: [
      {
        initials: 'SM',
        sender: 'Sophie Martin',
        time: '07:12',
        subject: 'RE: RE: RE: scan du passeport ?',
        preview: 'désolée, je ne retrouve plus votre mail, vous pouvez me redire…',
      },
      {
        initials: 'RD',
        sender: 'Rachid Dubois',
        time: 'hier',
        subject: 'Tr: Tr: autorisation chloé',
        attachment: 'autorisation_parentale_v3_FINAL(2).pdf',
      },
      {
        initials: 'Moi',
        sender: 'Moi, à 14 parents',
        time: 'lun.',
        subject: 'Relance assurance — 4e tentative',
        preview: 'bonsoir, sans retour de votre part avant vendredi…',
      },
    ],
    afterLabel: 'Ce que vous voyez dans Eazyexchange',
    results: [
      { label: 'Passeport', pill: pill('Complet', 'ok') },
      { label: 'Autorisation parentale', pill: pill('Complet', 'ok') },
      { label: 'Assurance', pill: pill('Relance envoyée', 'info') },
      { label: 'Fiche santé', pill: pill('Complet', 'ok') },
    ],
  },
  slice: {
    exchange: 'Berlin ↔ Lyon 2026',
    phase: 'Phase 2 · Dossiers',
    funnel: [
      { key: 'all', label: 'Élèves', count: 24 },
      { key: 'complete', label: 'Dossiers complets', count: 13 },
      { key: 'pending', label: 'En attente', count: 6 },
      { key: 'review', label: 'À vérifier', count: 3 },
      { key: 'missing', label: 'Document manquant', count: 2 },
    ],
    cols: ['Élève', 'Candidature', 'Formulaires', 'Documents', 'Statut'],
    rows: [
      {
        name: 'Emma Martin',
        key: 'missing',
        cells: [pill('Complet', 'ok'), pill('Complet', 'ok'), pill('Passeport manquant', 'bad'), pill('Incomplet', 'bad')],
        flagged: true,
      },
      {
        name: 'Lucas Bernard',
        key: 'complete',
        cells: [pill('Complet', 'ok'), pill('Complet', 'ok'), pill('Complet', 'ok'), pill('Complet', 'ok')],
      },
      {
        name: 'Chloé Dubois',
        key: 'pending',
        cells: [pill('Complet', 'ok'), pill('2 / 3', 'warn'), pill('En attente', 'warn'), pill('En attente', 'warn')],
      },
      {
        name: 'Yanis Meziane',
        key: 'review',
        cells: [pill('À vérifier', 'info'), pill('En attente', 'warn'), pill('En attente', 'warn'), pill('À vérifier', 'info')],
      },
      {
        name: 'Léa Fontaine',
        key: 'pending',
        cells: [pill('Complet', 'ok'), pill('Complet', 'ok'), pill('En attente', 'warn'), pill('En attente', 'warn')],
      },
      {
        name: 'Nora Haddad',
        key: 'complete',
        cells: [pill('Complet', 'ok'), pill('Complet', 'ok'), pill('Complet', 'ok'), pill('Complet', 'ok')],
      },
    ],
    footAll: 'Tous les élèves sont affichés',
    footMoreOne: '… + {n} autre élève',
    footMoreMany: '… + {n} autres élèves',
    activityTitle: 'Ce matin, automatiquement',
    activity: [
      { time: '06:00', text: 'Relance envoyée · Emma M. · passeport' },
      { time: '06:00', text: 'Relance envoyée · Yanis M. · assurance' },
      { time: '07:40', text: 'Document reçu · Chloé D. · autorisation', ok: true },
    ],
    todoTitle: 'À faire maintenant',
    todoBody: 'Vérifier la candidature de Yanis Meziane. C’est tout.',
    annotations: [
      'Ces relances sont parties à 6 h. Personne n’a écrit un seul mail.',
      'Un document manquant a déjà sa prochaine relance programmée.',
      'Cliquez un chiffre pour voir qui bloque — essayez, c’est le vrai produit.',
    ],
  },
  benefits: {
    blocks: [
      {
        eyebrow: '01 · Invitations',
        title: 'Les élèves remplissent leur dossier eux-mêmes',
        body: 'Vous invitez par e-mail. Chaque élève reçoit son espace avec la liste exacte de ce qu’on attend de lui : formulaires, signatures, pièces à téléverser. Vous regardez les dossiers se compléter.',
      },
      {
        eyebrow: '02 · Relances',
        title: 'Les relances partent sans vous',
        body: 'Un document manque ? Eazyexchange relance l’élève et ses parents au bon rythme, jusqu’à réception. Vous n’écrivez plus jamais « RE: RE: scan du passeport ? ».',
      },
      {
        eyebrow: '03 · Suivi',
        title: 'Vous savez qui bloque, en un coup d’œil',
        body: 'Chaque élève, chaque pièce, chaque paiement sur un seul écran, phase par phase. Fini le tableur partagé et les fils de mails pour savoir où en est un dossier.',
      },
    ],
    invite: {
      label: 'Inviter des élèves',
      chip: 'emma.martin@…',
      more: '+ 23 autres',
      button: 'Envoyer les invitations',
      students: [
        { name: 'Lucas Bernard', pct: 100, done: true },
        { name: 'Emma Martin', pct: 80 },
        { name: 'Chloé Dubois', pct: 45 },
      ],
    },
    reminders: {
      label: 'Relances automatiques',
      toggle: 'Activées',
      rows: [
        { time: 'lun 06:00', text: 'Passeport · Emma Martin', pill: pill('Relance envoyée', 'info') },
        { time: 'lun 06:00', text: 'Assurance · Yanis Meziane', pill: pill('Relance envoyée', 'info') },
        { time: 'lun 09:14', text: 'Autorisation · Chloé Dubois', pill: pill('Document reçu', 'ok') },
      ],
      note: 'prochaine relance dans 3 jours · stop automatique à réception',
    },
    matrix: {
      label: 'Phase 2 · Dossiers & documents',
      done: '18 / 24 complets',
      blocked: '2 bloqués',
      cols: ['Dossier', 'Formul.', 'Docs', 'Paiement'],
      rows: [
        {
          name: 'Lucas B.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Emma M.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '!', tone: 'bad', ring: true },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Chloé D.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '2/3', tone: 'warn' },
            { label: '…', tone: 'warn' },
            { label: '—', tone: 'mut' },
          ],
        },
        {
          name: 'Yanis M.',
          cells: [
            { label: 'à vérif.', tone: 'info' },
            { label: '…', tone: 'warn' },
            { label: '!', tone: 'bad', ring: true },
            { label: '—', tone: 'mut' },
          ],
        },
      ],
      legend: { ok: 'complet', warn: 'en attente', bad: 'bloqué' },
    },
  },
  savings: {
    eyebrow: 'Le calcul',
    title: 'Récupérez 30 heures par échange',
    p1: 'Nos utilisateurs déclarent plus de 30 heures passées, par échange, à relancer les élèves et récupérer formulaires, signatures et documents. Eazyexchange fait ce travail à leur place.',
    p2: 'Le premier échange est gratuit : vous mesurez les heures gagnées avant de dépenser un euro.',
    cardTitle: 'Ce que ces heures valent',
    rows: [
      { label: 'Relances, tri des pièces, saisie manuelle', value: '≈ 30 h' },
      { label: '30 h de coordination, valorisées', value: '≈ 300 €' },
      { label: 'Temps gagné avec Eazyexchange', value: '≈ 30 h / échange', green: true },
    ],
    totalLabel: 'Votre premier échange sur Eazyexchange',
    totalValue: '0 €',
  },
  closing: {
    title: 'Votre prochain échange, sans la paperasse.',
    cta: 'Démarrer mon échange gratuit',
    note: 'Premier échange gratuit · sans carte bancaire',
  },
  footer: { product: 'Produit', login: 'Se connecter', copyright: '© 2026 Eazyexchange' },
}

const en: LandingContent = {
  nav: { product: 'Product', login: 'Log in', cta: 'Start free' },
  hero: {
    eyebrow: 'For school exchange organizers',
    title: 'Stop chasing your students’ documents',
    sub: 'Applications, forms and reminders in one place. Your first exchange is free, nothing to install.',
    ctaPrimary: 'Start my free exchange',
    note: 'No credit card · your students invited in 5 minutes',
  },
  sweep: {
    beforeLabel: 'What you get today',
    inboxTitle: 'Inbox',
    unread: '47',
    emails: [
      {
        initials: 'SM',
        sender: 'Sophie Martin',
        time: '07:12',
        subject: 'RE: RE: RE: passport scan?',
        preview: 'sorry, I can’t find your email anymore, could you resend…',
      },
      {
        initials: 'RD',
        sender: 'Rachid Dubois',
        time: 'yest.',
        subject: 'Fwd: Fwd: chloé authorization',
        attachment: 'parental_authorization_v3_FINAL(2).pdf',
      },
      {
        initials: 'Me',
        sender: 'Me, to 14 parents',
        time: 'Mon.',
        subject: 'Insurance reminder — 4th attempt',
        preview: 'good evening, if we don’t hear from you by Friday…',
      },
    ],
    afterLabel: 'What you see in Eazyexchange',
    results: [
      { label: 'Passport', pill: pill('Complete', 'ok') },
      { label: 'Parental authorization', pill: pill('Complete', 'ok') },
      { label: 'Insurance', pill: pill('Reminder sent', 'info') },
      { label: 'Health form', pill: pill('Complete', 'ok') },
    ],
  },
  slice: {
    exchange: 'Berlin ↔ Lyon 2026',
    phase: 'Phase 2 · Files',
    funnel: [
      { key: 'all', label: 'Students', count: 24 },
      { key: 'complete', label: 'Complete files', count: 13 },
      { key: 'pending', label: 'Pending', count: 6 },
      { key: 'review', label: 'To review', count: 3 },
      { key: 'missing', label: 'Missing document', count: 2 },
    ],
    cols: ['Student', 'Application', 'Forms', 'Documents', 'Status'],
    rows: [
      {
        name: 'Emma Martin',
        key: 'missing',
        cells: [pill('Complete', 'ok'), pill('Complete', 'ok'), pill('Passport missing', 'bad'), pill('Incomplete', 'bad')],
        flagged: true,
      },
      {
        name: 'Lucas Bernard',
        key: 'complete',
        cells: [pill('Complete', 'ok'), pill('Complete', 'ok'), pill('Complete', 'ok'), pill('Complete', 'ok')],
      },
      {
        name: 'Chloé Dubois',
        key: 'pending',
        cells: [pill('Complete', 'ok'), pill('2 / 3', 'warn'), pill('Pending', 'warn'), pill('Pending', 'warn')],
      },
      {
        name: 'Yanis Meziane',
        key: 'review',
        cells: [pill('To review', 'info'), pill('Pending', 'warn'), pill('Pending', 'warn'), pill('To review', 'info')],
      },
      {
        name: 'Léa Fontaine',
        key: 'pending',
        cells: [pill('Complete', 'ok'), pill('Complete', 'ok'), pill('Pending', 'warn'), pill('Pending', 'warn')],
      },
      {
        name: 'Nora Haddad',
        key: 'complete',
        cells: [pill('Complete', 'ok'), pill('Complete', 'ok'), pill('Complete', 'ok'), pill('Complete', 'ok')],
      },
    ],
    footAll: 'All students are shown',
    footMoreOne: '… + {n} more student',
    footMoreMany: '… + {n} more students',
    activityTitle: 'This morning, automatically',
    activity: [
      { time: '06:00', text: 'Reminder sent · Emma M. · passport' },
      { time: '06:00', text: 'Reminder sent · Yanis M. · insurance' },
      { time: '07:40', text: 'Document received · Chloé D. · authorization', ok: true },
    ],
    todoTitle: 'To do now',
    todoBody: 'Review Yanis Meziane’s application. That’s it.',
    annotations: [
      'These reminders went out at 6 am. Nobody wrote a single email.',
      'A missing document already has its next reminder scheduled.',
      'Click a number to see who’s blocking — try it, it’s the real product.',
    ],
  },
  benefits: {
    blocks: [
      {
        eyebrow: '01 · Invitations',
        title: 'Students complete their own files',
        body: 'You invite by email. Each student gets their own space with the exact list of what’s expected of them: forms, signatures, documents to upload. You watch the files complete themselves.',
      },
      {
        eyebrow: '02 · Reminders',
        title: 'Reminders go out without you',
        body: 'A document is missing? Eazyexchange reminds the student and their parents at the right pace, until it arrives. You never write “RE: RE: passport scan?” again.',
      },
      {
        eyebrow: '03 · Tracking',
        title: 'Know who’s blocking, at a glance',
        body: 'Every student, every document, every payment on a single screen, phase by phase. No more shared spreadsheet and email threads to find out where a file stands.',
      },
    ],
    invite: {
      label: 'Invite students',
      chip: 'emma.martin@…',
      more: '+ 23 more',
      button: 'Send invitations',
      students: [
        { name: 'Lucas Bernard', pct: 100, done: true },
        { name: 'Emma Martin', pct: 80 },
        { name: 'Chloé Dubois', pct: 45 },
      ],
    },
    reminders: {
      label: 'Automatic reminders',
      toggle: 'On',
      rows: [
        { time: 'Mon 06:00', text: 'Passport · Emma Martin', pill: pill('Reminder sent', 'info') },
        { time: 'Mon 06:00', text: 'Insurance · Yanis Meziane', pill: pill('Reminder sent', 'info') },
        { time: 'Mon 09:14', text: 'Authorization · Chloé Dubois', pill: pill('Document received', 'ok') },
      ],
      note: 'next reminder in 3 days · stops automatically on receipt',
    },
    matrix: {
      label: 'Phase 2 · Files & documents',
      done: '18 / 24 complete',
      blocked: '2 blocked',
      cols: ['File', 'Forms', 'Docs', 'Payment'],
      rows: [
        {
          name: 'Lucas B.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Emma M.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '!', tone: 'bad', ring: true },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Chloé D.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '2/3', tone: 'warn' },
            { label: '…', tone: 'warn' },
            { label: '—', tone: 'mut' },
          ],
        },
        {
          name: 'Yanis M.',
          cells: [
            { label: 'review', tone: 'info' },
            { label: '…', tone: 'warn' },
            { label: '!', tone: 'bad', ring: true },
            { label: '—', tone: 'mut' },
          ],
        },
      ],
      legend: { ok: 'complete', warn: 'pending', bad: 'blocked' },
    },
  },
  savings: {
    eyebrow: 'The math',
    title: 'Get back 30 hours per exchange',
    p1: 'Our users report more than 30 hours spent, per exchange, chasing students and collecting forms, signatures and documents. Eazyexchange does that work for them.',
    p2: 'The first exchange is free: you measure the hours saved before spending a cent.',
    cardTitle: 'What those hours are worth',
    rows: [
      { label: 'Reminders, sorting documents, manual entry', value: '≈ 30 h' },
      { label: '30 h of coordination, valued', value: '≈ €300' },
      { label: 'Time saved with Eazyexchange', value: '≈ 30 h / exchange', green: true },
    ],
    totalLabel: 'Your first exchange on Eazyexchange',
    totalValue: '€0',
  },
  closing: {
    title: 'Your next exchange, without the paperwork.',
    cta: 'Start my free exchange',
    note: 'First exchange free · no credit card',
  },
  footer: { product: 'Product', login: 'Log in', copyright: '© 2026 Eazyexchange' },
}

const es: LandingContent = {
  nav: { product: 'Producto', login: 'Iniciar sesión', cta: 'Empezar gratis' },
  hero: {
    eyebrow: 'Para organizadores de intercambios escolares',
    title: 'Deja de perseguir los documentos de tus estudiantes',
    sub: 'Candidaturas, formularios y recordatorios en un mismo lugar. Tu primer intercambio es gratis, sin instalación.',
    ctaPrimary: 'Empezar mi intercambio gratis',
    note: 'Sin tarjeta de crédito · tus estudiantes invitados en 5 minutos',
  },
  sweep: {
    beforeLabel: 'Lo que recibes hoy',
    inboxTitle: 'Bandeja de entrada',
    unread: '47',
    emails: [
      {
        initials: 'SM',
        sender: 'Sophie Martin',
        time: '07:12',
        subject: 'RE: RE: RE: ¿escaneo del pasaporte?',
        preview: 'perdona, no encuentro tu correo, ¿me lo puedes repetir…',
      },
      {
        initials: 'RD',
        sender: 'Rachid Dubois',
        time: 'ayer',
        subject: 'RV: RV: autorización chloé',
        attachment: 'autorizacion_parental_v3_FINAL(2).pdf',
      },
      {
        initials: 'Yo',
        sender: 'Yo, a 14 padres',
        time: 'lun.',
        subject: 'Recordatorio seguro — 4.º intento',
        preview: 'buenas noches, si no recibimos respuesta antes del viernes…',
      },
    ],
    afterLabel: 'Lo que ves en Eazyexchange',
    results: [
      { label: 'Pasaporte', pill: pill('Completo', 'ok') },
      { label: 'Autorización parental', pill: pill('Completo', 'ok') },
      { label: 'Seguro', pill: pill('Recordatorio enviado', 'info') },
      { label: 'Ficha de salud', pill: pill('Completo', 'ok') },
    ],
  },
  slice: {
    exchange: 'Berlin ↔ Lyon 2026',
    phase: 'Fase 2 · Expedientes',
    funnel: [
      { key: 'all', label: 'Estudiantes', count: 24 },
      { key: 'complete', label: 'Expedientes completos', count: 13 },
      { key: 'pending', label: 'Pendientes', count: 6 },
      { key: 'review', label: 'Por revisar', count: 3 },
      { key: 'missing', label: 'Documento faltante', count: 2 },
    ],
    cols: ['Estudiante', 'Candidatura', 'Formularios', 'Documentos', 'Estado'],
    rows: [
      {
        name: 'Emma Martin',
        key: 'missing',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Falta pasaporte', 'bad'), pill('Incompleto', 'bad')],
        flagged: true,
      },
      {
        name: 'Lucas Bernard',
        key: 'complete',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok')],
      },
      {
        name: 'Chloé Dubois',
        key: 'pending',
        cells: [pill('Completo', 'ok'), pill('2 / 3', 'warn'), pill('Pendiente', 'warn'), pill('Pendiente', 'warn')],
      },
      {
        name: 'Yanis Meziane',
        key: 'review',
        cells: [pill('Por revisar', 'info'), pill('Pendiente', 'warn'), pill('Pendiente', 'warn'), pill('Por revisar', 'info')],
      },
      {
        name: 'Léa Fontaine',
        key: 'pending',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Pendiente', 'warn'), pill('Pendiente', 'warn')],
      },
      {
        name: 'Nora Haddad',
        key: 'complete',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok')],
      },
    ],
    footAll: 'Todos los estudiantes están visibles',
    footMoreOne: '… + {n} estudiante más',
    footMoreMany: '… + {n} estudiantes más',
    activityTitle: 'Esta mañana, automáticamente',
    activity: [
      { time: '06:00', text: 'Recordatorio enviado · Emma M. · pasaporte' },
      { time: '06:00', text: 'Recordatorio enviado · Yanis M. · seguro' },
      { time: '07:40', text: 'Documento recibido · Chloé D. · autorización', ok: true },
    ],
    todoTitle: 'Para hacer ahora',
    todoBody: 'Revisar la candidatura de Yanis Meziane. Eso es todo.',
    annotations: [
      'Estos recordatorios salieron a las 6 h. Nadie escribió un solo correo.',
      'Un documento faltante ya tiene su próximo recordatorio programado.',
      'Haz clic en una cifra para ver quién bloquea — pruébalo, es el producto real.',
    ],
  },
  benefits: {
    blocks: [
      {
        eyebrow: '01 · Invitaciones',
        title: 'Los estudiantes completan su expediente ellos mismos',
        body: 'Invitas por correo electrónico. Cada estudiante recibe su espacio con la lista exacta de lo que se espera de él: formularios, firmas, documentos que subir. Tú ves cómo los expedientes se van completando.',
      },
      {
        eyebrow: '02 · Recordatorios',
        title: 'Los recordatorios salen sin ti',
        body: '¿Falta un documento? Eazyexchange recuerda al estudiante y a sus padres al ritmo adecuado, hasta recibirlo. Nunca más escribirás «RE: RE: ¿escaneo del pasaporte?».',
      },
      {
        eyebrow: '03 · Seguimiento',
        title: 'Sabes quién bloquea, de un vistazo',
        body: 'Cada estudiante, cada documento, cada pago en una sola pantalla, fase por fase. Se acabaron la hoja de cálculo compartida y los hilos de correo para saber cómo va un expediente.',
      },
    ],
    invite: {
      label: 'Invitar estudiantes',
      chip: 'emma.martin@…',
      more: '+ 23 más',
      button: 'Enviar las invitaciones',
      students: [
        { name: 'Lucas Bernard', pct: 100, done: true },
        { name: 'Emma Martin', pct: 80 },
        { name: 'Chloé Dubois', pct: 45 },
      ],
    },
    reminders: {
      label: 'Recordatorios automáticos',
      toggle: 'Activados',
      rows: [
        { time: 'lun 06:00', text: 'Pasaporte · Emma Martin', pill: pill('Recordatorio enviado', 'info') },
        { time: 'lun 06:00', text: 'Seguro · Yanis Meziane', pill: pill('Recordatorio enviado', 'info') },
        { time: 'lun 09:14', text: 'Autorización · Chloé Dubois', pill: pill('Documento recibido', 'ok') },
      ],
      note: 'próximo recordatorio en 3 días · parada automática al recibirlo',
    },
    matrix: {
      label: 'Fase 2 · Expedientes y documentos',
      done: '18 / 24 completos',
      blocked: '2 bloqueados',
      cols: ['Expediente', 'Formul.', 'Docs', 'Pago'],
      rows: [
        {
          name: 'Lucas B.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Emma M.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '!', tone: 'bad', ring: true },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Chloé D.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '2/3', tone: 'warn' },
            { label: '…', tone: 'warn' },
            { label: '—', tone: 'mut' },
          ],
        },
        {
          name: 'Yanis M.',
          cells: [
            { label: 'a revisar', tone: 'info' },
            { label: '…', tone: 'warn' },
            { label: '!', tone: 'bad', ring: true },
            { label: '—', tone: 'mut' },
          ],
        },
      ],
      legend: { ok: 'completo', warn: 'pendiente', bad: 'bloqueado' },
    },
  },
  savings: {
    eyebrow: 'La cuenta',
    title: 'Recupera 30 horas por intercambio',
    p1: 'Nuestros usuarios declaran más de 30 horas dedicadas, por intercambio, a recordar a los estudiantes y recopilar formularios, firmas y documentos. Eazyexchange hace ese trabajo por ellos.',
    p2: 'El primer intercambio es gratis: mides las horas ganadas antes de gastar un euro.',
    cardTitle: 'Lo que valen esas horas',
    rows: [
      { label: 'Recordatorios, clasificación de documentos, entrada manual', value: '≈ 30 h' },
      { label: '30 h de coordinación, valoradas', value: '≈ 300 €' },
      { label: 'Tiempo ganado con Eazyexchange', value: '≈ 30 h / intercambio', green: true },
    ],
    totalLabel: 'Tu primer intercambio en Eazyexchange',
    totalValue: '0 €',
  },
  closing: {
    title: 'Tu próximo intercambio, sin papeleo.',
    cta: 'Empezar mi intercambio gratis',
    note: 'Primer intercambio gratis · sin tarjeta de crédito',
  },
  footer: { product: 'Producto', login: 'Iniciar sesión', copyright: '© 2026 Eazyexchange' },
}

const it: LandingContent = {
  nav: { product: 'Prodotto', login: 'Accedi', cta: 'Inizia gratis' },
  hero: {
    eyebrow: 'Per gli organizzatori di scambi scolastici',
    title: 'Smetti di rincorrere i documenti dei tuoi studenti',
    sub: 'Candidature, moduli e solleciti nello stesso posto. Il tuo primo scambio è gratuito, senza installazione.',
    ctaPrimary: 'Inizia il mio scambio gratuito',
    note: 'Senza carta di credito · i tuoi studenti invitati in 5 minuti',
  },
  sweep: {
    beforeLabel: 'Quello che ricevi oggi',
    inboxTitle: 'Posta in arrivo',
    unread: '47',
    emails: [
      {
        initials: 'SM',
        sender: 'Sophie Martin',
        time: '07:12',
        subject: 'RE: RE: RE: scansione del passaporto?',
        preview: 'scusi, non ritrovo più la sua mail, può ripetermi…',
      },
      {
        initials: 'RD',
        sender: 'Rachid Dubois',
        time: 'ieri',
        subject: 'I: I: autorizzazione chloé',
        attachment: 'autorizzazione_genitori_v3_FINAL(2).pdf',
      },
      {
        initials: 'Io',
        sender: 'Io, a 14 genitori',
        time: 'lun.',
        subject: 'Sollecito assicurazione — 4º tentativo',
        preview: 'buonasera, senza un suo riscontro entro venerdì…',
      },
    ],
    afterLabel: 'Quello che vedi in Eazyexchange',
    results: [
      { label: 'Passaporto', pill: pill('Completo', 'ok') },
      { label: 'Autorizzazione dei genitori', pill: pill('Completo', 'ok') },
      { label: 'Assicurazione', pill: pill('Sollecito inviato', 'info') },
      { label: 'Scheda sanitaria', pill: pill('Completo', 'ok') },
    ],
  },
  slice: {
    exchange: 'Berlin ↔ Lyon 2026',
    phase: 'Fase 2 · Pratiche',
    funnel: [
      { key: 'all', label: 'Studenti', count: 24 },
      { key: 'complete', label: 'Pratiche complete', count: 13 },
      { key: 'pending', label: 'In attesa', count: 6 },
      { key: 'review', label: 'Da verificare', count: 3 },
      { key: 'missing', label: 'Documento mancante', count: 2 },
    ],
    cols: ['Studente', 'Candidatura', 'Moduli', 'Documenti', 'Stato'],
    rows: [
      {
        name: 'Emma Martin',
        key: 'missing',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Passaporto mancante', 'bad'), pill('Incompleto', 'bad')],
        flagged: true,
      },
      {
        name: 'Lucas Bernard',
        key: 'complete',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok')],
      },
      {
        name: 'Chloé Dubois',
        key: 'pending',
        cells: [pill('Completo', 'ok'), pill('2 / 3', 'warn'), pill('In attesa', 'warn'), pill('In attesa', 'warn')],
      },
      {
        name: 'Yanis Meziane',
        key: 'review',
        cells: [pill('Da verificare', 'info'), pill('In attesa', 'warn'), pill('In attesa', 'warn'), pill('Da verificare', 'info')],
      },
      {
        name: 'Léa Fontaine',
        key: 'pending',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('In attesa', 'warn'), pill('In attesa', 'warn')],
      },
      {
        name: 'Nora Haddad',
        key: 'complete',
        cells: [pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok'), pill('Completo', 'ok')],
      },
    ],
    footAll: 'Tutti gli studenti sono visualizzati',
    footMoreOne: '… + {n} altro studente',
    footMoreMany: '… + {n} altri studenti',
    activityTitle: 'Stamattina, automaticamente',
    activity: [
      { time: '06:00', text: 'Sollecito inviato · Emma M. · passaporto' },
      { time: '06:00', text: 'Sollecito inviato · Yanis M. · assicurazione' },
      { time: '07:40', text: 'Documento ricevuto · Chloé D. · autorizzazione', ok: true },
    ],
    todoTitle: 'Da fare adesso',
    todoBody: 'Verificare la candidatura di Yanis Meziane. Tutto qui.',
    annotations: [
      'Questi solleciti sono partiti alle 6. Nessuno ha scritto una sola mail.',
      'Un documento mancante ha già il prossimo sollecito programmato.',
      'Clicca un numero per vedere chi blocca — provaci, è il prodotto vero.',
    ],
  },
  benefits: {
    blocks: [
      {
        eyebrow: '01 · Inviti',
        title: 'Gli studenti completano la pratica da soli',
        body: 'Inviti via e-mail. Ogni studente riceve il suo spazio con l’elenco esatto di ciò che ci si aspetta da lui: moduli, firme, documenti da caricare. Tu guardi le pratiche completarsi.',
      },
      {
        eyebrow: '02 · Solleciti',
        title: 'I solleciti partono senza di te',
        body: 'Manca un documento? Eazyexchange sollecita lo studente e i suoi genitori al ritmo giusto, fino alla ricezione. Non scriverai mai più «RE: RE: scansione del passaporto?».',
      },
      {
        eyebrow: '03 · Monitoraggio',
        title: 'Sai chi blocca, a colpo d’occhio',
        body: 'Ogni studente, ogni documento, ogni pagamento su un unico schermo, fase per fase. Basta fogli di calcolo condivisi e thread di mail per sapere a che punto è una pratica.',
      },
    ],
    invite: {
      label: 'Invitare studenti',
      chip: 'emma.martin@…',
      more: '+ 23 altri',
      button: 'Invia gli inviti',
      students: [
        { name: 'Lucas Bernard', pct: 100, done: true },
        { name: 'Emma Martin', pct: 80 },
        { name: 'Chloé Dubois', pct: 45 },
      ],
    },
    reminders: {
      label: 'Solleciti automatici',
      toggle: 'Attivati',
      rows: [
        { time: 'lun 06:00', text: 'Passaporto · Emma Martin', pill: pill('Sollecito inviato', 'info') },
        { time: 'lun 06:00', text: 'Assicurazione · Yanis Meziane', pill: pill('Sollecito inviato', 'info') },
        { time: 'lun 09:14', text: 'Autorizzazione · Chloé Dubois', pill: pill('Documento ricevuto', 'ok') },
      ],
      note: 'prossimo sollecito tra 3 giorni · stop automatico alla ricezione',
    },
    matrix: {
      label: 'Fase 2 · Pratiche e documenti',
      done: '18 / 24 complete',
      blocked: '2 bloccate',
      cols: ['Pratica', 'Moduli', 'Doc', 'Pagamento'],
      rows: [
        {
          name: 'Lucas B.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Emma M.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '!', tone: 'bad', ring: true },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Chloé D.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '2/3', tone: 'warn' },
            { label: '…', tone: 'warn' },
            { label: '—', tone: 'mut' },
          ],
        },
        {
          name: 'Yanis M.',
          cells: [
            { label: 'da verif.', tone: 'info' },
            { label: '…', tone: 'warn' },
            { label: '!', tone: 'bad', ring: true },
            { label: '—', tone: 'mut' },
          ],
        },
      ],
      legend: { ok: 'completo', warn: 'in attesa', bad: 'bloccato' },
    },
  },
  savings: {
    eyebrow: 'Il conto',
    title: 'Recupera 30 ore per scambio',
    p1: 'I nostri utenti dichiarano più di 30 ore passate, per scambio, a sollecitare gli studenti e recuperare moduli, firme e documenti. Eazyexchange fa questo lavoro al posto loro.',
    p2: 'Il primo scambio è gratuito: misuri le ore guadagnate prima di spendere un euro.',
    cardTitle: 'Quanto valgono queste ore',
    rows: [
      { label: 'Solleciti, smistamento dei documenti, inserimento manuale', value: '≈ 30 h' },
      { label: '30 h di coordinamento, valorizzate', value: '≈ 300 €' },
      { label: 'Tempo guadagnato con Eazyexchange', value: '≈ 30 h / scambio', green: true },
    ],
    totalLabel: 'Il tuo primo scambio su Eazyexchange',
    totalValue: '0 €',
  },
  closing: {
    title: 'Il tuo prossimo scambio, senza scartoffie.',
    cta: 'Inizia il mio scambio gratuito',
    note: 'Primo scambio gratuito · senza carta di credito',
  },
  footer: { product: 'Prodotto', login: 'Accedi', copyright: '© 2026 Eazyexchange' },
}

const de: LandingContent = {
  nav: { product: 'Produkt', login: 'Anmelden', cta: 'Kostenlos starten' },
  hero: {
    eyebrow: 'Für Organisatoren von Schüleraustauschen',
    title: 'Hören Sie auf, den Dokumenten Ihrer Schüler hinterherzulaufen',
    sub: 'Bewerbungen, Formulare und Erinnerungen an einem Ort. Ihr erster Austausch ist gratis, ohne Installation.',
    ctaPrimary: 'Meinen kostenlosen Austausch starten',
    note: 'Keine Kreditkarte · Ihre Schüler in 5 Minuten eingeladen',
  },
  sweep: {
    beforeLabel: 'Was Sie heute bekommen',
    inboxTitle: 'Posteingang',
    unread: '47',
    emails: [
      {
        initials: 'SM',
        sender: 'Sophie Martin',
        time: '07:12',
        subject: 'RE: RE: RE: Scan des Reisepasses?',
        preview: 'entschuldigung, ich finde Ihre Mail nicht mehr, können Sie mir noch einmal…',
      },
      {
        initials: 'RD',
        sender: 'Rachid Dubois',
        time: 'gestern',
        subject: 'WG: WG: einverständnis chloé',
        attachment: 'einverstaendnis_eltern_v3_FINAL(2).pdf',
      },
      {
        initials: 'Ich',
        sender: 'Ich, an 14 Eltern',
        time: 'Mo.',
        subject: 'Erinnerung Versicherung — 4. Versuch',
        preview: 'guten Abend, ohne Ihre Rückmeldung bis Freitag…',
      },
    ],
    afterLabel: 'Was Sie in Eazyexchange sehen',
    results: [
      { label: 'Reisepass', pill: pill('Vollständig', 'ok') },
      { label: 'Einverständniserklärung', pill: pill('Vollständig', 'ok') },
      { label: 'Versicherung', pill: pill('Erinnerung gesendet', 'info') },
      { label: 'Gesundheitsbogen', pill: pill('Vollständig', 'ok') },
    ],
  },
  slice: {
    exchange: 'Berlin ↔ Lyon 2026',
    phase: 'Phase 2 · Akten',
    funnel: [
      { key: 'all', label: 'Schüler', count: 24 },
      { key: 'complete', label: 'Vollständige Akten', count: 13 },
      { key: 'pending', label: 'Ausstehend', count: 6 },
      { key: 'review', label: 'Zu prüfen', count: 3 },
      { key: 'missing', label: 'Fehlendes Dokument', count: 2 },
    ],
    cols: ['Schüler', 'Bewerbung', 'Formulare', 'Dokumente', 'Status'],
    rows: [
      {
        name: 'Emma Martin',
        key: 'missing',
        cells: [pill('Vollständig', 'ok'), pill('Vollständig', 'ok'), pill('Reisepass fehlt', 'bad'), pill('Unvollständig', 'bad')],
        flagged: true,
      },
      {
        name: 'Lucas Bernard',
        key: 'complete',
        cells: [pill('Vollständig', 'ok'), pill('Vollständig', 'ok'), pill('Vollständig', 'ok'), pill('Vollständig', 'ok')],
      },
      {
        name: 'Chloé Dubois',
        key: 'pending',
        cells: [pill('Vollständig', 'ok'), pill('2 / 3', 'warn'), pill('Ausstehend', 'warn'), pill('Ausstehend', 'warn')],
      },
      {
        name: 'Yanis Meziane',
        key: 'review',
        cells: [pill('Zu prüfen', 'info'), pill('Ausstehend', 'warn'), pill('Ausstehend', 'warn'), pill('Zu prüfen', 'info')],
      },
      {
        name: 'Léa Fontaine',
        key: 'pending',
        cells: [pill('Vollständig', 'ok'), pill('Vollständig', 'ok'), pill('Ausstehend', 'warn'), pill('Ausstehend', 'warn')],
      },
      {
        name: 'Nora Haddad',
        key: 'complete',
        cells: [pill('Vollständig', 'ok'), pill('Vollständig', 'ok'), pill('Vollständig', 'ok'), pill('Vollständig', 'ok')],
      },
    ],
    footAll: 'Alle Schüler werden angezeigt',
    footMoreOne: '… + {n} weiterer Schüler',
    footMoreMany: '… + {n} weitere Schüler',
    activityTitle: 'Heute Morgen, automatisch',
    activity: [
      { time: '06:00', text: 'Erinnerung gesendet · Emma M. · Reisepass' },
      { time: '06:00', text: 'Erinnerung gesendet · Yanis M. · Versicherung' },
      { time: '07:40', text: 'Dokument erhalten · Chloé D. · Einverständnis', ok: true },
    ],
    todoTitle: 'Jetzt zu tun',
    todoBody: 'Die Bewerbung von Yanis Meziane prüfen. Das ist alles.',
    annotations: [
      'Diese Erinnerungen gingen um 6 Uhr raus. Niemand hat eine einzige Mail geschrieben.',
      'Ein fehlendes Dokument hat seine nächste Erinnerung bereits geplant.',
      'Klicken Sie auf eine Zahl, um zu sehen, wer blockiert — probieren Sie es, das ist das echte Produkt.',
    ],
  },
  benefits: {
    blocks: [
      {
        eyebrow: '01 · Einladungen',
        title: 'Die Schüler füllen ihre Akte selbst aus',
        body: 'Sie laden per E-Mail ein. Jeder Schüler erhält seinen Bereich mit der genauen Liste dessen, was von ihm erwartet wird: Formulare, Unterschriften, hochzuladende Dokumente. Sie sehen zu, wie sich die Akten vervollständigen.',
      },
      {
        eyebrow: '02 · Erinnerungen',
        title: 'Die Erinnerungen gehen ohne Sie raus',
        body: 'Ein Dokument fehlt? Eazyexchange erinnert den Schüler und seine Eltern im richtigen Rhythmus, bis es eintrifft. Sie schreiben nie wieder „RE: RE: Scan des Reisepasses?“.',
      },
      {
        eyebrow: '03 · Überblick',
        title: 'Sie sehen auf einen Blick, wer blockiert',
        body: 'Jeder Schüler, jedes Dokument, jede Zahlung auf einem einzigen Bildschirm, Phase für Phase. Schluss mit geteilten Tabellen und Mail-Verläufen, um den Stand einer Akte zu kennen.',
      },
    ],
    invite: {
      label: 'Schüler einladen',
      chip: 'emma.martin@…',
      more: '+ 23 weitere',
      button: 'Einladungen senden',
      students: [
        { name: 'Lucas Bernard', pct: 100, done: true },
        { name: 'Emma Martin', pct: 80 },
        { name: 'Chloé Dubois', pct: 45 },
      ],
    },
    reminders: {
      label: 'Automatische Erinnerungen',
      toggle: 'Aktiviert',
      rows: [
        { time: 'Mo 06:00', text: 'Reisepass · Emma Martin', pill: pill('Erinnerung gesendet', 'info') },
        { time: 'Mo 06:00', text: 'Versicherung · Yanis Meziane', pill: pill('Erinnerung gesendet', 'info') },
        { time: 'Mo 09:14', text: 'Einverständnis · Chloé Dubois', pill: pill('Dokument erhalten', 'ok') },
      ],
      note: 'nächste Erinnerung in 3 Tagen · stoppt automatisch bei Erhalt',
    },
    matrix: {
      label: 'Phase 2 · Akten & Dokumente',
      done: '18 / 24 vollständig',
      blocked: '2 blockiert',
      cols: ['Akte', 'Formul.', 'Doku', 'Zahlung'],
      rows: [
        {
          name: 'Lucas B.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Emma M.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '✓', tone: 'ok' },
            { label: '!', tone: 'bad', ring: true },
            { label: '✓', tone: 'ok' },
          ],
        },
        {
          name: 'Chloé D.',
          cells: [
            { label: '✓', tone: 'ok' },
            { label: '2/3', tone: 'warn' },
            { label: '…', tone: 'warn' },
            { label: '—', tone: 'mut' },
          ],
        },
        {
          name: 'Yanis M.',
          cells: [
            { label: 'prüfen', tone: 'info' },
            { label: '…', tone: 'warn' },
            { label: '!', tone: 'bad', ring: true },
            { label: '—', tone: 'mut' },
          ],
        },
      ],
      legend: { ok: 'vollständig', warn: 'ausstehend', bad: 'blockiert' },
    },
  },
  savings: {
    eyebrow: 'Die Rechnung',
    title: 'Holen Sie sich 30 Stunden pro Austausch zurück',
    p1: 'Unsere Nutzer berichten von über 30 Stunden pro Austausch, um Schüler zu erinnern und Formulare, Unterschriften und Dokumente einzusammeln. Eazyexchange übernimmt diese Arbeit für sie.',
    p2: 'Der erste Austausch ist gratis: Sie messen die gewonnenen Stunden, bevor Sie einen Euro ausgeben.',
    cardTitle: 'Was diese Stunden wert sind',
    rows: [
      { label: 'Erinnerungen, Sortieren der Unterlagen, manuelle Eingabe', value: '≈ 30 Std.' },
      { label: '30 Std. Koordination, bewertet', value: '≈ 300 €' },
      { label: 'Gewonnene Zeit mit Eazyexchange', value: '≈ 30 Std. / Austausch', green: true },
    ],
    totalLabel: 'Ihr erster Austausch auf Eazyexchange',
    totalValue: '0 €',
  },
  closing: {
    title: 'Ihr nächster Austausch, ohne Papierkram.',
    cta: 'Meinen kostenlosen Austausch starten',
    note: 'Erster Austausch gratis · keine Kreditkarte',
  },
  footer: { product: 'Produkt', login: 'Anmelden', copyright: '© 2026 Eazyexchange' },
}

export const landingContent: Record<Locale, LandingContent> = { fr, en, es, it, de }
