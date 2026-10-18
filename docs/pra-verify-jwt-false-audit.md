# PR A — Audit Edge Functions `verify_jwt = false`

Résultat écrit avant migration 2 (DROP policies).

| Function | Auth actuelle | Verdict | Action PR A |
|---|---|---|---|
| `portal-contract` | `projectToken` → resolve + `assertProjectToken` / accès template lié | OK | Aucune — token lié à la ressource |
| `portal-payment-link` | `.eq('token', projectToken)` puis Stripe sur ce projet | OK | Aucune |
| `portal-document-upload-url` | token + item.project_id | OK (nouveau) | Rate-limit 30/h |
| `extract-document-data` | token + **path lu en base** via item_id | OK après PR A | Path client retiré |
| `trigger-integrations` | `projectId` + `projectToken` match obligatoire | OK | Documenté ; refuse sans token |
| `send-project-invite` | JWT owner **ou** internal secret **ou** token | OK | Internal secret déjà via `isInternalRequest` |
| `send-project-completed-notification` | `assertProjectToken(projectId, projectToken)` | OK | Aucune |
| `send-payment-link-email` | JWT **ou** token **ou** internal | OK | Refuse projectId seul sans secret |
| `send-reminders-batch` | `CRON_SECRET` header | OK | Aucune |
| `smart-reminders-batch` | `CRON_SECRET` | OK | Aucune |
| `generate-smart-reminder` | `isInternalRequest` | OK | Aucune |
| `send-smart-reminder` | JWT **ou** internal | OK | Aucune |
| `stripe-webhook` | Signature Stripe | OK | Aucune |
| `resend-events-webhook` | Svix | OK | Aucune |
| `google-drive-oauth-callback` | OAuth state | OK | Aucune |
| `send-password-reset-email` | Public email flow | OK | Hors projet |
| `create-saas-checkout` / `verify-saas-checkout` / `complete-saas-signup` | SaaS public | OK | Hors portail projet |
| `bootstrap-saas-prices` | header bootstrap | OK | Aucune |
| `submit-waitlist-signup` | honeypot | OK | Aucune |

## Règle appliquée

Tout endpoint qui accepte un `projectId` **sans** JWT doit aussi vérifier :
1. `projectToken` correspondant, **ou**
2. `x-internal-secret` / `x-cron-secret` = `CRON_SECRET`.

`trigger-integrations` et `send-project-completed-notification` exigent déjà (1).
`send-payment-link-email` / invite / cron utilisent (2) ou JWT.
