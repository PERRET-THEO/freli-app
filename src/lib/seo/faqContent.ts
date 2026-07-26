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
      "Oui pour les contrats d'onboarding : devis, contrat de prestation, autorisation de droit à l'image, cession de droits. Votre client signe directement depuis son téléphone ou son ordinateur, sans logiciel tiers ni compte à créer. Pour des actes nécessitant une signature avancée ou qualifiée (immobilier, acte notarié, certains marchés publics), gardez un prestataire de confiance certifié eIDAS.",
  },
  {
    question: 'Quel niveau de signature électronique Freli propose-t-il ?',
    answer:
      "Freli propose une signature électronique simple au sens du règlement eIDAS. C'est le niveau utilisé par la grande majorité des contrats commerciaux entre professionnels : en droit français, un contrat signé électroniquement est valide et recevable (articles 1366 et 1367 du Code civil), la force probante s'appréciant au regard des preuves associées. Freli ne délivre pas de signature avancée ni qualifiée avec certificat nominatif.",
  },
  {
    question: 'Quelles preuves Freli conserve-t-il pour une signature ?',
    answer:
      "Pour chaque signature, Freli enregistre le nom et l'email du signataire, la date et l'heure, l'adresse IP, le navigateur utilisé, ainsi qu'une empreinte SHA-256 du PDF signé qui permet de démontrer que le document n'a pas été modifié après signature. Ces informations sont également imprimées sur le document, et l'acceptation explicite des conditions est requise avant de signer.",
  },
  {
    question: 'Combien de temps les contrats signés sont-ils conservés ?',
    answer:
      "Les contrats signés et leurs preuves associées restent disponibles dans votre espace Freli pendant toute la durée de votre abonnement, et sont copiés dans votre Google Drive si l'intégration est activée — vous en gardez donc une copie que vous maîtrisez. Nous recommandons d'archiver vos contrats de votre côté selon vos obligations légales de conservation.",
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
      "Freli propose deux offres, Solo et Agence (détails sur freli.fr/tarifs). L'accès se fait sur invitation : les conditions tarifaires exactes sont confirmées lors de la démo de 30 minutes.",
  },
]
