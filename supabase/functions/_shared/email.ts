/** URL du logo Freli affiché dans les emails HTML (bucket Supabase Storage). */
export function getFreliEmailLogoUrl(): string {
  const fromEnv = Deno.env.get('FRELI_EMAIL_LOGO_URL')?.trim()
  if (fromEnv) return fromEnv
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? 'https://xxghfeshnihagvahmmpr.supabase.co').replace(
    /\/$/,
    '',
  )
  return `${supabaseUrl}/storage/v1/object/public/Freli%20logo/Logo%20Freli.png`
}

/** Expédiateur Resend. En prod, définir RESEND_FROM (ex. "Freli <noreply@freli.app>"). */
export function getResendFrom(): string {
  return Deno.env.get('RESEND_FROM') ?? 'Freli <onboarding@resend.dev>'
}

/** Expéditeur pour emails d'authentification (reset password). */
export function getAuthResendFrom(): string {
  return (
    Deno.env.get('AUTH_RESEND_FROM') ??
    Deno.env.get('RESEND_FROM') ??
    'Freli <onboarding@resend.dev>'
  )
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
