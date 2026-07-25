import type { FaqEntry } from './jsonLd'

export const faqEntries: FaqEntry[] = [
  {
    question: "Qu'est-ce que Freli ?",
    answer:
      "Freli est une plateforme SaaS française qui automatise l'onboarding client des freelances et agences. Elle remplace les emails, les Google Forms et les relances manuelles par un portail unique : formulaire, documents, signature électronique, paiement Stripe et synchronisation Google Drive.",
  },
  {
    question: 'À qui s’adresse Freli ?',
    answer:
      "Freli s'adresse aux freelances et agences francophones (web, design, marketing, conseil) qui onboardent régulièrement de nouveaux clients et veulent gagner du temps sur la collecte d'informations, de documents et de signatures.",
  },
  {
    question: 'Comment obtenir un accès à Freli ?',
    answer:
      "L'accès à Freli se fait sur invitation. Réservez une démo de 30 minutes sur freli.fr/demo : c'est la première étape pour obtenir un compte. La mise en route prend environ 5 minutes, sans formation nécessaire.",
  },
  {
    question: 'Quelle différence avec des emails ou un Google Form ?',
    answer:
      "Avec des emails ou un Google Form, vous devez relancer manuellement, centraliser les pièces vous-même et jongler entre plusieurs outils. Freli regroupe formulaire, dépôt de documents, signature et paiement dans un seul lien, relance automatiquement votre client et vous notifie quand tout est prêt.",
  },
  {
    question: 'Freli remplace-t-il DocuSign pour la signature ?',
    answer:
      "Oui pour les contrats d'onboarding : la signature électronique est intégrée à Freli. Votre client signe directement depuis son téléphone ou son ordinateur, sans logiciel tiers ni compte à créer.",
  },
  {
    question: 'Comment fonctionne le paiement Stripe ?',
    answer:
      "Vous connectez votre compte Stripe une fois (Stripe Connect). À la fin de l'onboarding, Freli envoie un lien de paiement à votre client et suit le statut jusqu'au règlement. Freli ne stocke aucune coordonnée bancaire.",
  },
  {
    question: 'Que synchronise Freli avec Google Drive ?',
    answer:
      "À la clôture d'un onboarding, Freli crée un dossier client dans votre Drive et y synchronise les documents transmis, les contrats signés et le récapitulatif de la checklist.",
  },
  {
    question: "D'où viennent les données entreprise préremplies ?",
    answer:
      "Freli interroge l'API Recherche d'Entreprises (data.gouv.fr). En recherchant par nom, SIREN ou SIRET, la raison sociale, l'adresse, le code NAF et le numéro de TVA sont préremplis automatiquement. La saisie manuelle reste possible.",
  },
  {
    question: 'Freli est-il conforme au RGPD ?',
    answer:
      "Oui. Les données sont hébergées dans l'Union européenne (Supabase), les paiements sont traités par Stripe, et la politique de confidentialité détaille les données collectées, les finalités et vos droits. Contact : support@freli.fr.",
  },
  {
    question: 'Puis-je connecter Freli à mes autres outils ?',
    answer:
      "Oui, via les webhooks sortants : Zapier, Make et n8n sont compatibles directement, ce qui permet de brancher Slack, Notion, Airtable, votre CRM ou votre outil comptable via un automatisateur.",
  },
  {
    question: 'Combien coûte Freli ?',
    answer:
      "Freli est actuellement accessible sur invitation, avec un accompagnement personnalisé à la mise en route. Les conditions tarifaires sont présentées lors de la démo.",
  },
]
