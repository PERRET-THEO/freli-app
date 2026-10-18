# Clé maître Freli — `FRELI_SECRETS_KEY_V1`

Chiffre les identifiants clients (`checklist_item_secrets`) en AES-256-GCM dans les Edge Functions.

## Génération

```bash
openssl rand -base64 32
```

La sortie fait 44 caractères (32 octets encodés en base64). C’est la valeur à stocker dans le secret EF `FRELI_SECRETS_KEY_V1`.

Alternative hex (64 caractères) aussi acceptée par le helper :

```bash
openssl rand -hex 32
```

## Sauvegarde hors Supabase — OBLIGATOIRE avant tout chiffrement

1. Copier la clé dans un gestionnaire de secrets **hors** Supabase (1Password, Bitwarden, coffre ops).
2. Seulement ensuite : `supabase secrets set FRELI_SECRETS_KEY_V1='…'`
3. Ne jamais committer la clé dans le dépôt, les issues, ou le chat.

**Perte de la clé = secrets clients irrécupérables.** Il n’existe pas de backdoor ni de dérivation depuis Vault.

## Rotation future

- Introduire `FRELI_SECRETS_KEY_V2` + colonne `key_version`.
- Re-chiffrer progressivement ; ne supprimer `V1` qu’après migration complète.
