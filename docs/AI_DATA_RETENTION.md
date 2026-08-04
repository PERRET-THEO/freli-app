# Rétention & conformité données IA (Freli)

## Sous-traitant Mistral

- Appels OCR / chat / vision uniquement depuis Edge Functions (`ai-provider.ts`).
- Clé `MISTRAL_API_KEY` (ou `_DEV`) en secrets serveur — jamais `VITE_*`.
- Hébergement UE par défaut côté Mistral ; activer **Zero Data Retention (ZDR)** sur le plan Scale pour désactiver la rétention training/debug Mistral (30 j sinon).

## `ocr_markdown` / `ocr_pages`

- Conservés uniquement pendant le statut `processing` / `pending_review` / `failed`.
- Purge automatique à la validation ou au rejet humain (trigger `trg_clear_extraction_ocr_on_review`).
- Objectif RGPD : minimisation des pièces d’identité / RIB en clair dans la base produit.

## Crédits & logs

- `ai_usage_logs` : tokens, durée, coût estimé (`estimated_cost_cents`), `prompt_version`, crédits consommés.
- Pas d’IBAN / numéro de pièce dans les logs d’usage.
- Ledger `ai_credit_ledger` : deltas uniquement (pas de PII).

## Paywall

- Source de vérité runtime : `billing_accounts.ai_addon_active`.
- Synced depuis les items d’abonnement Stripe (webhook `customer.subscription.*`).
- Désactivation add-on → flags modules IA remis à `false`.
