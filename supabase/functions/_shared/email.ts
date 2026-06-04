// Configuration email partagée entre les Edge Functions.

/** Expédiateur Resend. En prod, définir RESEND_FROM (ex. "Freli <noreply@freli.app>"). */
export function getResendFrom(): string {
  return Deno.env.get('RESEND_FROM') ?? 'Freli <onboarding@resend.dev>'
}

/** Vrai en développement local (APP_URL pointe vers localhost) : emails simulés. */
export function isDevMode(): boolean {
  return (Deno.env.get('APP_URL') ?? '').includes('localhost')
}

type ResendSendResult = { data?: unknown; error?: { message?: string } | null }

/** Lève une erreur si Resend a refusé l'envoi (ex. 403 sandbox → destinataire non autorisé). */
export function assertResendOk(result: ResendSendResult): void {
  if (result.error) {
    throw new Error(result.error.message ?? 'Erreur Resend')
  }
}
