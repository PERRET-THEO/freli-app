import { answerBlocks } from './answerBlocks'

export type ComparisonSlug = 'content-snare' | 'clustdoc' | 'emails-forms-docusign'

export type ComparisonFaq = {
  question: string
  answer: string
}

export type ComparisonPage = {
  slug: ComparisonSlug
  path: string
  title: string
  metaTitle: string
  metaDescription: string
  competitorName: string
  intro: string
  /** Answer block AEO (~40–60 mots) sous le H1. */
  answerBlock: string
  rows: { criterion: string; freli: string; other: string }[]
  verdict: string
  faqs: ComparisonFaq[]
}

export const comparisonPages: ComparisonPage[] = [
  {
    slug: 'content-snare',
    path: '/vs/content-snare',
    title: 'Freli vs Content Snare',
    metaTitle: 'Freli vs Content Snare — onboarding client pour freelances',
    metaDescription:
      'Comparez Freli et Content Snare : portail sans compte, signature électronique, paiement Stripe et autofill SIREN pour les freelances et agences françaises.',
    competitorName: 'Content Snare',
    intro:
      'Content Snare excelle à collecter documents et réponses. Freli va plus loin pour les freelances et agences FR : signature, paiement et Drive dans le même lien.',
    answerBlock: answerBlocks.vsContentSnare,
    rows: [
      {
        criterion: 'Portail client sans compte',
        freli: 'Oui (magic link)',
        other: 'Oui',
      },
      {
        criterion: 'Signature électronique native',
        freli: 'Oui',
        other: 'Non (outil externe)',
      },
      {
        criterion: 'Paiement dans le parcours',
        freli: 'Oui (Stripe Connect)',
        other: 'Non',
      },
      {
        criterion: 'Approve / reject des pièces',
        freli: 'Oui',
        other: 'Oui (cœur produit)',
      },
      {
        criterion: 'Autofill entreprise FR (SIREN)',
        freli: 'Oui (data.gouv)',
        other: 'Non',
      },
      {
        criterion: 'Sync Google Drive',
        freli: 'Native',
        other: 'Export / automatisations',
      },
    ],
    verdict:
      'Choisissez Content Snare si votre seul besoin est la collecte documentaire intensive. Choisissez Freli si vous voulez clôturer l’onboarding (signé + payé + classé) sans empiler DocuSign et Stripe.',
    faqs: [
      {
        question: 'Freli remplace-t-il Content Snare ?',
        answer:
          'Pour un onboarding freelance/agence FR qui inclut signature et paiement, oui en pratique. Si votre seul besoin est une collecte documentaire très intensive multi-parties, Content Snare reste spécialisé.',
      },
      {
        question: 'Freli gère-t-il la signature sans DocuSign ?',
        answer:
          'Oui : signature électronique simple eIDAS intégrée au portail, avec preuves (horodatage, IP, hash SHA-256). Pas besoin d’un outil tiers pour les contrats d’onboarding standards.',
      },
      {
        question: 'Le client doit-il créer un compte ?',
        answer:
          'Non. Le client ouvre un magic link Freli, remplit, dépose, signe et paie sans créer de compte.',
      },
      {
        question: 'Combien coûte Freli face à Content Snare ?',
        answer:
          'Freli : abonnement unique 59 € HT / mois ou 590 € HT / an. Content Snare facture selon ses grilles US ; comparez le coût total avec DocuSign + Stripe si vous empilez les outils.',
      },
    ],
  },
  {
    slug: 'clustdoc',
    path: '/vs/clustdoc',
    title: 'Freli vs Clustdoc',
    metaTitle: 'Freli vs Clustdoc — intake client léger pour freelances',
    metaDescription:
      'Freli vs Clustdoc : comparez un onboarding client léger FR (portail, e-sign, Stripe, SIREN) à une plateforme d’intake plus lourde et souvent tarifée entreprise.',
    competitorName: 'Clustdoc',
    intro:
      'Clustdoc cible des parcours d’intake structurés, parfois réglementés. Freli reste volontairement léger : démarrer une mission en 2 minutes, sans formation.',
    answerBlock: answerBlocks.vsClustdoc,
    rows: [
      {
        criterion: 'Temps de mise en route',
        freli: '~5 minutes',
        other: 'Jours selon la complexité',
      },
      {
        criterion: 'Cible principale',
        freli: 'Freelances & petites agences FR',
        other: 'Équipes / secteurs régulés',
      },
      {
        criterion: 'E-sign + paiement natifs',
        freli: 'Oui',
        other: 'Oui',
      },
      {
        criterion: 'KYC / conformité avancée',
        freli: 'Hors scope',
        other: 'Oui (force Clustdoc)',
      },
      {
        criterion: 'Autofill SIREN / data.gouv',
        freli: 'Oui',
        other: 'Non natif',
      },
      {
        criterion: 'Positionnement prix',
        freli: '59 € HT/mois (abo unique)',
        other: 'Souvent 100–190 $/mois+',
      },
    ],
    verdict:
      'Clustdoc si vous avez besoin de conformité lourde multi-parties. Freli si vous voulez un portail d’onboarding simple, français, et branché sur vos outils (Stripe, Drive, webhooks).',
    faqs: [
      {
        question: 'Freli ou Clustdoc pour une petite agence ?',
        answer:
          'Freli est pensé pour freelances et petites agences FR qui veulent démarrer vite. Clustdoc convient mieux aux équipes avec besoins d’intake réglementés ou multi-parties complexes.',
      },
      {
        question: 'Freli propose-t-il l’autofill SIREN ?',
        answer:
          'Oui, via l’API Recherche d’Entreprises (data.gouv.fr) : raison sociale, adresse, NAF et TVA préremplis à partir du SIREN/SIRET.',
      },
      {
        question: 'Combien de temps pour mettre Freli en route ?',
        answer:
          'Environ 5 minutes : branding du portail, checklist, Stripe Connect et Drive. Pas de formation obligatoire.',
      },
      {
        question: 'Quel est le prix de Freli ?',
        answer:
          'Abonnement unique 59 € HT / mois ou 590 € HT / an, add-on IA optionnel à 29 € HT / mois. Détails sur freli.fr/tarifs.',
      },
    ],
  },
  {
    slug: 'emails-forms-docusign',
    path: '/vs/emails-forms-docusign',
    title: 'Freli vs emails + Forms + DocuSign',
    metaTitle: 'Freli vs emails, Google Forms et DocuSign',
    metaDescription:
      'Remplacez la stack manuelle emails + Google Forms + DocuSign + Stripe par un seul lien Freli : collecte, signature, paiement et relances automatiques.',
    competitorName: 'Stack manuelle',
    intro:
      'La plupart des freelances onboardent encore avec une mosaïque d’outils. Freli regroupe le parcours dans un seul lien brandé.',
    answerBlock: answerBlocks.vsEmailsFormsDocusign,
    rows: [
      {
        criterion: 'Nombre d’outils',
        freli: '1 portail',
        other: '3 à 5 (mail, Forms, DocuSign, Stripe, Drive)',
      },
      {
        criterion: 'Relances',
        freli: 'Automatiques',
        other: 'Manuelles',
      },
      {
        criterion: 'Expérience client',
        freli: 'Un lien, sans compte',
        other: 'Plusieurs onglets et comptes',
      },
      {
        criterion: 'Temps moyen estimé',
        freli: '~4 minutes côté freelance',
        other: '~3 h par client',
      },
      {
        criterion: 'Preuves de signature',
        freli: 'Intégrées (horodatage, hash)',
        other: 'Chez DocuSign uniquement',
      },
      {
        criterion: 'Données entreprise FR',
        freli: 'Préremplies via SIREN',
        other: 'Saisie manuelle',
      },
    ],
    verdict:
      'Gardez votre stack si vous n’onboardez qu’un client par trimestre. Passez à Freli dès que les relances et les allers-retours deviennent un coût caché récurrent.',
    faqs: [
      {
        question: 'Pourquoi quitter emails + Forms + DocuSign ?',
        answer:
          'Parce que chaque outil ajoute friction client, relances manuelles et risque d’oublier une pièce. Un seul lien Freli réduit le temps freelance à ~2–5 minutes par lancement.',
      },
      {
        question: 'Freli remplace-t-il DocuSign ?',
        answer:
          'Pour les contrats d’onboarding B2B standards (devis, prestation, cession de droits), oui. Pour une signature avancée/qualifiée eIDAS, gardez un prestataire certifié.',
      },
      {
        question: 'Les relances sont-elles automatiques ?',
        answer:
          'Oui : Freli relance le client si des étapes restent incomplètes, sans que vous rédigiez chaque rappel.',
      },
      {
        question: 'Combien coûte Freli vs la stack manuelle ?',
        answer:
          'Freli : 59 € HT / mois (ou 590 € HT / an). La stack manuelle additionne souvent Forms (gratuit) + DocuSign + temps de relance — le coût caché est surtout le temps.',
      },
    ],
  },
]

export function getComparisonBySlug(slug: string): ComparisonPage | undefined {
  return comparisonPages.find((page) => page.slug === slug)
}
