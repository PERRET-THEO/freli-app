# Bascule tarifs : 29 € HT / mois + IA 12 € HT / mois

Ancienne grille : 59 € HT/mois · 590 €/an · IA 29 €/mois · 290 €/an.
Nouvelle grille : **29 € HT/mois · 290 €/an** · **IA 12 €/mois · 120 €/an** (annuel = 2 mois offerts, engagement 12 mois).

Code : branche `tarifs-29-euros`. Script : `scripts/bascule-tarifs.sh`.

## Pourquoi cet ordre

- Un prix Stripe est immuable : on crée 4 nouveaux prix, on leur transfère les `lookup_key`
  (`freli_subscription_month|year`, `freli_ai_month|year`) et on archive les anciens.
- Les fonctions **actuellement en ligne** lisent d'abord les secrets `STRIPE_PRICE_*` (anciens prix).
  Si on archive les anciens prix avant de déployer le nouveau code, le Checkout échoue.
- Le nouveau code lit d'abord la `lookup_key` dans Stripe → il suit automatiquement la bascule.
- La page tarifs (Vercel) est publiée **en dernier** : entre la bascule Stripe et le push,
  le site affiche encore 59 € mais Stripe facture 29 € (écart sans risque pour le client).

## Étapes

| # | Commande | Effet | Résultat attendu |
|---|----------|-------|------------------|
| 1 | `./scripts/bascule-tarifs.sh jeton` | Crée `~/.freli-bootstrap-token` + secret `SAAS_BOOTSTRAP_TOKEN` | Ferme aussi la faille du jeton par défaut `freli-setup` |
| 2 | `./scripts/bascule-tarifs.sh deployer` | Déploie 7 Edge Functions | Aucun prix ne change |
| 3 | `./scripts/bascule-tarifs.sh simulation` | Dry run, lecture seule | 4 lignes `"action": "replace"` avec `oldAmountCents` 5900 / 59000 / 2900 / 29000 |
| 4 | `./scripts/bascule-tarifs.sh bascule` | Écrit dans Stripe LIVE + table `billing_stripe_prices` | 4 `newPriceId`, `"dbUpdated": true` |
| 5 | `./scripts/bascule-tarifs.sh secrets` | Aligne les 4 secrets `STRIPE_PRICE_*` | Secrets mis à jour |
| 6 | `./scripts/bascule-tarifs.sh verif` | Dry run, lecture seule | 4 lignes `"action": "reuse"` |
| 7 | Test manuel | Ouvrir `/tarifs` → « Démarrer mon abonnement » | La page Stripe Checkout affiche 29 € HT (ne pas payer) ; idem annuel + IA = 410 € HT |
| 8 | `git commit` + `git push` (merge sur `main`) | Vercel publie la nouvelle page | Page tarifs à 29 € |

Si l'étape 3 affiche autre chose que 4 `replace` (ex. `create`), **s'arrêter** et vérifier dans Stripe.

## Retour arrière

- Avant l'étape 4 : rien à défaire (le nouveau code fonctionne aussi avec l'ancienne grille).
- Après l'étape 4 : remettre les anciens montants dans `SPECS`
  (`supabase/functions/bootstrap-saas-prices/index.ts`), redéployer cette fonction,
  relancer `bascule` puis `secrets` → de nouveaux prix à 59 € / 29 € sont recréés.
- Les abonnements existants ne sont jamais modifiés par ce processus.

## Après la bascule

- Mettre à jour les IDs de prix listés dans `.env.example` (lus dans `~/.freli-bascule-tarifs-result.json`).
- Mentionner l'engagement de 12 mois de l'offre annuelle dans les CGU.
