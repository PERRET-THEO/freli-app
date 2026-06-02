/** Email support affiché dans Paramètres (surcharge via VITE_SUPPORT_EMAIL). */
export const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || 'support@freli.app'

export const supportMailto = `mailto:${SUPPORT_EMAIL}`
