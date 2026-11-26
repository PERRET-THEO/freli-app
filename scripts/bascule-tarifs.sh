#!/usr/bin/env bash
# Bascule de la grille SaaS Freli vers 29 € HT/mois (290 €/an) + IA 12 €/mois (120 €/an).
# Voir docs/bascule-tarifs-29.md. À lancer étape par étape, dans l'ordre :
#
#   ./scripts/bascule-tarifs.sh jeton        # 1. crée le jeton local + secret Supabase
#   ./scripts/bascule-tarifs.sh deployer     # 2. déploie les Edge Functions (aucun prix ne change)
#   ./scripts/bascule-tarifs.sh simulation   # 3. dry run : affiche ce qui changerait dans Stripe
#   ./scripts/bascule-tarifs.sh bascule      # 4. crée les nouveaux prix Stripe, archive les anciens
#   ./scripts/bascule-tarifs.sh secrets      # 5. aligne les secrets STRIPE_PRICE_* sur les nouveaux prix
#   ./scripts/bascule-tarifs.sh verif        # 6. relit l'état (nouveau dry run : tout doit être "reuse")
#
# Ensuite seulement : commit + push → Vercel publie la nouvelle page tarifs.
set -euo pipefail

PROJECT_REF="xxghfeshnihagvahmmpr"
FN_URL="https://${PROJECT_REF}.supabase.co/functions/v1/bootstrap-saas-prices"
TOKEN_FILE="${HOME}/.freli-bootstrap-token"
RESULT_FILE="${HOME}/.freli-bascule-tarifs-result.json"
FUNCTIONS=(
  bootstrap-saas-prices
  create-saas-checkout
  verify-saas-checkout
  complete-saas-signup
  stripe-webhook
  list-subscription-leads
  resend-subscription-invite
)

cd "$(dirname "$0")/.."

confirm() {
  read -r -p "$1 [oui/non] " answer
  [[ "$answer" == "oui" ]] || { echo "Annulé."; exit 1; }
}

token() {
  [[ -s "$TOKEN_FILE" ]] || { echo "Jeton absent : lance d'abord l'étape « jeton »."; exit 1; }
  cat "$TOKEN_FILE"
}

call_bootstrap() {
  local query="$1"
  curl -sS --fail-with-body -X POST "${FN_URL}${query}" -H "x-freli-bootstrap: $(token)"
}

case "${1:-}" in
  jeton)
    if [[ -s "$TOKEN_FILE" ]]; then
      echo "Jeton déjà présent dans $TOKEN_FILE (réutilisé)."
    else
      (umask 077 && openssl rand -hex 24 > "$TOKEN_FILE")
      echo "Jeton créé dans $TOKEN_FILE (non affiché)."
    fi
    confirm "Enregistrer ce jeton comme secret SAAS_BOOTSTRAP_TOKEN sur Supabase ?"
    supabase secrets set "SAAS_BOOTSTRAP_TOKEN=$(token)" --project-ref "$PROJECT_REF"
    ;;

  deployer)
    echo "Déploiement de : ${FUNCTIONS[*]}"
    echo "Aucun prix ne change : Stripe sert encore l'ancienne grille tant que « bascule » n'est pas lancée."
    confirm "Déployer ces fonctions en production ?"
    supabase functions deploy "${FUNCTIONS[@]}" --project-ref "$PROJECT_REF"
    ;;

  simulation|verif)
    call_bootstrap "?dry_run=1" | python3 -m json.tool
    ;;

  bascule)
    echo "Va créer 4 nouveaux prix Stripe (LIVE), leur transférer les lookup_keys et archiver les anciens."
    echo "Les abonnements existants ne sont pas touchés."
    confirm "Lancer la bascule Stripe en production ?"
    call_bootstrap "" | tee "$RESULT_FILE" | python3 -m json.tool
    echo "Résultat enregistré dans $RESULT_FILE"
    ;;

  secrets)
    [[ -s "$RESULT_FILE" ]] || { echo "Pas de résultat de bascule : lance d'abord « bascule »."; exit 1; }
    args=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
p = d["prices"]
keys = ["STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY", "STRIPE_PRICE_AI_MONTHLY", "STRIPE_PRICE_AI_YEARLY"]
missing = [k for k in keys if not p.get(k)]
if missing: sys.exit("Prix manquants : " + ", ".join(missing))
print(" ".join(f"{k}={p[k]}" for k in keys))
' "$RESULT_FILE")
    echo "Secrets à appliquer : $args"
    confirm "Mettre à jour ces 4 secrets sur Supabase ?"
    # shellcheck disable=SC2086
    supabase secrets set $args --project-ref "$PROJECT_REF"
    ;;

  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
