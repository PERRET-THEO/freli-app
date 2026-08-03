/**
 * Blocs réponse AEO (≈40–60 mots) — citation-ready sous H1 des pages piliers.
 */
import { FRELI_AI_ADDON, FRELI_SUBSCRIPTION } from '../billing/entitlements'

export const answerBlocks = {
  home:
    'Freli est une plateforme française d’onboarding client pour freelances et agences : un lien unique pour formulaire, documents, signature électronique et paiement Stripe Connect, sans commission Freli sur vos encaissements. Relances automatiques, sync Google Drive et autofill SIREN inclus.',
  tarifs: `Freli propose un abonnement unique à ${FRELI_SUBSCRIPTION.monthlyLabelHt} par mois ou ${FRELI_SUBSCRIPTION.yearlyLabelHt} par an (−${FRELI_SUBSCRIPTION.yearlyDiscountPercent} %). Un add-on Modules IA optionnel coûte ${FRELI_AI_ADDON.monthlyLabelHt} / mois (${FRELI_AI_ADDON.includedCreditsPerMonth} crédits inclus). Les prix sont HT ; la TVA est calculée au paiement Stripe. Souscription en ligne sur cette page.`,
  faq: `Freli automatise l’onboarding client : portail unique, e-sign, Stripe Connect et Drive. Abonnement à ${FRELI_SUBSCRIPTION.monthlyLabelHt} / mois ou ${FRELI_SUBSCRIPTION.yearlyLabelHt} / an, add-on IA optionnel. Hébergement UE, signature eIDAS simple, données entreprise via data.gouv. Réponses détaillées ci-dessous.`,
  about:
    'Freli est l’éditeur français d’un SaaS d’onboarding client pour freelances et petites agences. Le produit regroupe collecte, signature, paiement et classement Drive dans un seul lien brandé — alternative locale aux stacks emails + Forms + DocuSign.',
  comparatifs:
    'Freli se compare aux outils d’intake et d’onboarding client (Content Snare, Clustdoc, stack emails + Forms + DocuSign), pas aux suites d’adoption produit. Objectif : un portail FR léger avec e-sign, Stripe Connect et autofill SIREN.',
  vsContentSnare:
    'Content Snare collecte surtout documents et réponses. Freli ajoute signature électronique, paiement Stripe Connect et autofill SIREN dans le même lien — adapté aux freelances et agences françaises qui veulent clôturer l’onboarding sans empiler DocuSign.',
  vsClustdoc:
    'Clustdoc cible des intakes structurés parfois réglementés. Freli reste léger pour freelances et petites agences FR : mise en route en ~5 minutes, e-sign, Stripe Connect, autofill SIREN et sync Drive, sans formation lourde.',
  vsEmailsFormsDocusign:
    'La stack emails + Google Forms + DocuSign + Stripe multiplie onglets et relances. Freli regroupe collecte, signature, paiement et Drive dans un seul lien brandé, avec relances automatiques — idéal dès que l’onboarding devient récurrent.',
} as const
