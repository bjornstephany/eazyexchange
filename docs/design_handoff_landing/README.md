# Handoff : Refonte de la landing page Eazyexchange

## Overview
Redesign complet de la landing page publique (`/`). Objectif de conversion unique : démarrer un essai gratuit ("Démarrer mon échange gratuit"). La page vend la transformation — paperasse et relances manuelles → suivi automatisé — et prouve chaque bénéfice avec une tranche de la vraie UI produit.

## About the Design Files
`Eazyexchange Landing.dc.html` (+ `support.js`, son runtime) est une **référence de design en HTML** — un prototype montrant le rendu et le comportement voulus, PAS du code de production. La tâche : **recréer ce design dans la codebase existante** (Next.js App Router + Tailwind + shadcn, `components/landing/*`), en suivant ses patterns. Ouvrir le fichier dans un navigateur pour le voir vivre (le funnel du dashboard est cliquable).

## Fidelity
**High-fidelity.** Couleurs, typo, espacements, copies et états sont finaux. Reproduire au pixel près avec les tokens Tailwind déjà présents dans `tailwind.config.ts` (section "Redesign tokens (design handoff, 2026-07)" : `navy`, `brand`, `tint`, `success`, `warn`, `danger`, etc. — ils correspondent aux hex de ce design).

## Mapping vers la codebase existante
La structure actuelle `LandingPage.tsx` (LandingNav → Hero → Features → HowItWorks → Testimonial → CtaBand → LandingFooter) devient :

| Nouveau composant | Remplace | Contenu |
|---|---|---|
| `LandingNav` (modifié) | LandingNav | logo, "Produit" (ancre #produit), "Se connecter", CTA bleu. **Plus de lien Tarifs.** |
| `Hero` (réécrit) | Hero | eyebrow mono, H1, sous-titre, CTA + lien expert, mention mono |
| `InboxSweep` (nouveau) | — | signature : carte "boîte de réception" → flèche → statuts produit |
| `ProductSlice` (nouveau, client) | — | tranche interactive du dashboard (funnel cliquable + tableau 5 colonnes + fil d'activité) + 3 annotations |
| `BenefitBlocks` (nouveau) | Features + HowItWorks | 3 blocs alternés (01 Invitations, 02 Relances, 03 Suivi) |
| `TimeSavings` (nouveau) | Testimonial | bande sombre "Le calcul" (30 h / 300 € / 0 €) |
| `DualPath` (nouveau) | — | deux cartes : essai vs expert |
| `CtaBand` (modifié) | CtaBand | même wording CTA que le hero |
| `LandingFooter` (modifié) | LandingFooter | liens Produit / Se connecter, © 2026. **Plus de Tarifs.** |

Le contenu texte vit dans `lib/landing/content.ts` (i18n) — la copie ci-dessous est la version **fr** ; garder le mécanisme de locale existant et traduire les autres locales à partir du fr.

## Design Tokens
Couleurs (déjà dans tailwind.config.ts) :
- Ink navy `#10203F` (titres, cartes sombres) · Rail navy `#0E1B38` (sections sombres)
- Accent `#2456E6`, hover `#1D48C7`, clair sur sombre `#7FA0F0` / `#3B6EF6`
- Fond page `#FBFCFE`, section produit `#EEF1F7`, cartes `#fff`, bordures `#E4E9F2` / `#EEF1F7`
- Texte secondaire `#5B6B8C` / `#42506E`, tertiaire `#8A97B2`, placeholder `#9AA6C0`
- Pilules statut : ok `#0F7A3D`/`#E4F5EA` · warn `#9A6A0B`/`#FBF0D9` · info `#1D48C7`/`#E6ECFD` · bad `#C0392B`/`#FBE7E4` · muet `#5B6B8C`/`#EEF1F7`
- Vert clair sur sombre (ligne "temps gagné") : `#7EE3A4`

Typo (Google Fonts, à charger via `next/font`) :
- **Schibsted Grotesk** 400–800 — display. H1 : 800, clamp(36px,5.2vw,60px)/1.04, letter-spacing −.028em. H2 : 700, clamp(26px,3vw,34px)/1.12, −.02em.
- **IBM Plex Sans** 400–700 — corps. Body 15.5px/1.6 ; sous-titre hero clamp(16px,1.6vw,19px)/1.55.
- **IBM Plex Mono** 400–600 — eyebrows (600 11px, letter-spacing .14em, uppercase), micro-labels de tableaux (600 10px, .07em, uppercase), horodatages, mentions.

Rayons : boutons 9–11px, cartes 12–16px, pilules 999px. Ombre CTA hero : `0 14px 30px -14px rgba(36,86,230,.55)`. Ombre carte produit : `0 40px 80px -50px rgba(16,32,63,.4)`.

## Sections (ordre exact, copie exacte)

### 1. Nav
Max-width 1160px, padding 20px 24px, flex space-between. Logo : deux cercles 18px superposés (navy + bleu, `mix-blend-mode:multiply`) + "Eazyexchange" Schibsted 700 19px. Liens : "Produit" (→ #produit), "Se connecter" (→ /login) en Plex Sans 500 14px `#42506E`, hover `#10203F`. CTA : "Démarrer gratuitement" bleu, radius 9px, padding 10px 16px.

### 2. Hero
- Eyebrow mono : `POUR LES ORGANISATEURS D'ÉCHANGES SCOLAIRES` (bleu)
- H1 : **Arrêtez de courir après les documents de vos élèves**
- Sous-titre : "Candidatures, formulaires et relances au même endroit. Votre premier échange est gratuit, sans installation."
- CTA primaire : **Démarrer mon échange gratuit** (bleu, padding 16px 28px, ombre) → /signup
- Lien secondaire souligné : "Parler à un expert produit" (visuellement subordonné, jamais un 2e bouton)
- Mention mono 12px `#8A97B2` : "Sans carte bancaire · vos élèves invités en 5 minutes"

### 3. InboxSweep (élément signature)
Trois colonnes flex (wrap) : carte inbox / flèche + logo / statuts produit.
- Label gauche : "CE QUE VOUS RECEVEZ AUJOURD'HUI". Carte façon client mail : en-tête "Boîte de réception" + badge rouge "47" ; 3 lignes e-mail (avatar initiales 28px, expéditeur 700 12.5px, objet 600 12px, aperçu/pièce jointe 11.5px `#8A97B2`, horodatage) :
  1. Sophie Martin · 07:12 · "RE: RE: RE: scan du passeport ?" · "désolée, je ne retrouve plus votre mail, vous pouvez me redire…"
  2. Rachid Dubois · hier · "Tr: Tr: autorisation chloé" · chip pièce jointe `autorisation_parentale_v3_FINAL(2).pdf`
  3. Moi, à 14 parents · lun. · "Relance assurance — 4e tentative" · "bonsoir, sans retour de votre part avant vendredi…"
- Centre : logo (2 cercles 21px) + flèche →
- Label droit : "CE QUE VOUS VOYEZ DANS EAZYEXCHANGE". 4 lignes : Passeport→Complet, Autorisation parentale→Complet, Assurance→Relance envoyée (pilule info), Fiche santé→Complet.
- Animations : lignes mail `ezDrift` (translateX 30px + fondu, 7s, décalées de ~1s), statuts `ezPulse` (7s, décalés). **`prefers-reduced-motion: reduce` coupe tout** (`animation:none`).

### 4. ProductSlice (client component — interactif)
Carte blanche radius 16px, grande ombre, sur dégradé `#FBFCFE → #EEF1F7`.
- En-tête : "Berlin ↔ Lyon 2026" (Schibsted 600 16px) + pilule mono "Phase 2 · Dossiers". **Pas de bouton d'action.**
- Corps 2 colonnes (2.1 / 1) :
  - **Funnel cliquable** — 5 chips (chiffre Schibsted 700 20px + label 11px) : Élèves 24 · Dossiers complets 13 · En attente 6 · À vérifier 3 · Document manquant 2. Chip active : bordure 2px bleue, chiffre bleu. Clic = filtre le tableau (state React local). Badge annotation ③ à côté.
  - **Tableau 5 colonnes** : Élève · Candidature · Formulaires · Documents · Statut (grid 1.2fr 1fr 1fr 1.4fr 1fr, min-width 600px, overflow-x auto). Données ci-dessous ; Emma M. porte le badge ② sur Documents. Pied : "… + N autres élèves" recalculé selon le filtre.
  - Colonne droite : carte "CE MATIN, AUTOMATIQUEMENT" + badge ① (06:00 "Relance envoyée · Emma M. · passeport", 06:00 "Relance envoyée · Yanis M. · assurance", 07:40 "Document reçu · Chloé D. · autorisation" en vert) et carte "À faire maintenant" (bord gauche bleu 3px) : "Vérifier la candidature de Yanis Meziane. C'est tout."
- Sous la carte, 3 annotations numérotées (pastilles bleues 18px) :
  1. "Ces relances sont parties à 6 h. Personne n'a écrit un seul mail."
  2. "Un document manquant a déjà sa prochaine relance programmée."
  3. "Cliquez un chiffre pour voir qui bloque — essayez, c'est le vrai produit."

Données de démonstration :

| Élève | Candidature | Formulaires | Documents | Statut | clé filtre |
|---|---|---|---|---|---|
| Emma Martin | Complet (ok) | Complet (ok) | Passeport manquant (bad) + ② | Incomplet (bad) | missing |
| Lucas Bernard | Complet | Complet | Complet | Complet | complete |
| Chloé Dubois | Complet | 2 / 3 (warn) | En attente (warn) | En attente (warn) | pending |
| Yanis Meziane | À vérifier (info) | En attente (warn) | En attente (warn) | À vérifier (info) | review |
| Léa Fontaine | Complet | Complet | En attente (warn) | En attente (warn) | pending |
| Nora Haddad | Complet | Complet | Complet | Complet | complete |

### 5. BenefitBlocks — fond `#EEF1F7`, id `produit`, 3 blocs alternés (texte/visuel, `row-reverse` sur le 2e)
- **01 · INVITATIONS** — H2 "Les élèves remplissent leur dossier eux-mêmes" + § : "Vous invitez par e-mail. Chaque élève reçoit son espace avec la liste exacte de ce qu'on attend de lui : formulaires, signatures, pièces à téléverser. Vous regardez les dossiers se compléter." Visuel : champ destinataires (chip `emma.martin@…` "+ 23 autres") + bouton navy "Envoyer les invitations" ; 3 barres de progression (Lucas Bernard 100 % vert, Emma Martin 80 %, Chloé Dubois 45 %).
- **02 · RELANCES** — H2 "Les relances partent sans vous" + § : "Un document manque ? Eazyexchange relance l'élève et ses parents au bon rythme, jusqu'à réception. Vous n'écrivez plus jamais « RE: RE: scan du passeport ? »." Visuel : toggle "Activées", 3 lignes horodatées (lun 06:00 Passeport · Emma Martin → Relance envoyée ; lun 06:00 Assurance · Yanis Meziane → Relance envoyée ; lun 09:14 Autorisation · Chloé Dubois → Document reçu, vert), mention "prochaine relance dans 3 jours · stop automatique à réception".
- **03 · SUIVI** — H2 "Vous savez qui bloque, en un coup d'œil" + § : "Chaque élève, chaque pièce, chaque paiement sur un seul écran, phase par phase. Fini le tableur partagé et les fils de mails pour savoir où en est un dossier." Visuel : **matrice élèves × étapes** — en-tête "PHASE 2 · DOSSIERS & DOCUMENTS" + "18 / 24 complets · 2 bloqués" (rouge) ; grid `96px repeat(4,1fr)`, colonnes Dossier / Formul. / Docs / Paiement ; 4 lignes : Lucas B. tout ✓ vert ; Emma M. "!" rouge bordé sur Docs ; Chloé D. "2/3" et "…" ambre + "—" gris ; Yanis M. "à vérif." bleu, "…", "!", "—" ; cellules 22px radius 6px ; légende complet / en attente / bloqué.

### 6. TimeSavings — bande sombre `#0E1B38`
- Eyebrow "LE CALCUL" `#7FA0F0` ; H2 blanc : **Récupérez 30 heures par échange**
- § 1 : "Nos utilisateurs déclarent plus de 30 heures passées, par échange, à relancer les élèves et récupérer formulaires, signatures et documents. Eazyexchange fait ce travail à leur place."
- § 2 : "Le premier échange est gratuit : vous mesurez les heures gagnées avant de dépenser un euro."
- Carte `#10203F` "CE QUE CES HEURES VALENT", lignes séparées par pointillés `rgba(255,255,255,.14)` :
  - Relances, tri des pièces, saisie manuelle → `≈ 30 h`
  - 30 h de coordination, valorisées → `≈ 300 €`
  - Temps gagné avec Eazyexchange → `≈ 30 h / échange` (vert `#7EE3A4`)
  - **Votre premier échange sur Eazyexchange → 0 €** (Schibsted 700 26px `#7FA0F0`)

### 7. DualPath — id `demarrer`
H2 "Deux façons de commencer" + intro "Selon que vous êtes prêt à essayer, ou que vous avez encore des questions.". Deux cartes :
- Carte 1 (bordure 2px bleue) : badge "Prêt à essayer" → "Lancez votre échange maintenant" → "Créez votre échange, invitez vos élèves ce soir. Aucune carte bancaire, rien à installer." → CTA bleu "Démarrer mon échange gratuit" → /signup
- Carte 2 (bordure grise) : badge "Encore des questions" → "Parlez-en d'abord à quelqu'un" → "30 minutes avec un expert produit, une démo construite sur votre prochain échange." → bouton outline "Parler à un expert produit"

### 8. Closing + Footer — fond `#0E1B38`
H2 800 blanc centré : "Votre prochain échange, sans la paperasse." + CTA bleu (même wording : "Démarrer mon échange gratuit") + mention mono `#7FA0F0` "Premier échange gratuit · sans carte bancaire". Footer : logo blanc, liens Produit / Se connecter (`#8595B8`, hover blanc), "© 2026 Eazyexchange".

## Interactions & Behavior
- Funnel du ProductSlice : `useState` local, données de démonstration en dur (c'est une vitrine, pas le vrai dashboard) ; le pied de tableau affiche `total − lignes visibles` ("… + N autres élèves", ou "Tous les élèves sont affichés").
- Ancres : nav "Produit" → `#produit` ; tous les CTA "Démarrer…" → `/signup` (dans le prototype : `#demarrer`) ; "Parler à un expert produit" → à brancher (calendly / contact).
- Hovers : liens `#42506E→#10203F` ; CTA `#2456E6→#1D48C7` ; lignes de tableau `#FAFBFE` ; chips funnel bordure bleue.
- Focus visible : `outline: 2px solid #2456E6; outline-offset: 2px` sur liens et boutons.
- `prefers-reduced-motion: reduce` → aucune animation.
- Responsive jusqu'à 375px : flex-wrap + `min-width` par colonne ; tableau en `overflow-x:auto` (min-width 600px) ; H1/H2 en `clamp()`.

## SEO / plomberie à conserver
`app/page.tsx` garde son metadata, le JSON-LD et le prerender statique (composant synchrone, pas d'appel auth — cf. commentaire existant). Mettre à jour title/description pour refléter le nouveau H1 si souhaité.

## Files
- `Eazyexchange Landing.dc.html` — design de référence (ouvrir dans un navigateur ; nécessite `support.js` à côté)
- `support.js` — runtime du prototype (ne pas porter dans la codebase)
