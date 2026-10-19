/** Miroir de src/lib/portalWelcomeTemplate.ts pour les Edge Functions. */

export type PortalWelcomeVars = {
  'client.prenom'?: string | null
  'client.entreprise'?: string | null
  'projet.nom'?: string | null
  'agence.nom'?: string | null
}

export const DEFAULT_PORTAL_WELCOME =
  'Complétez les étapes ci-dessous pour démarrer votre projet. Cela prend environ 10 minutes.'

const TOKEN_RE = /\{\{\s*([a-z.]+)(?:\|([^}]*))?\s*\}\}/gi

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveTokenValue(
  key: string,
  fallback: string | undefined,
  vars: PortalWelcomeVars,
): string {
  const normalized = key.trim().toLowerCase() as keyof PortalWelcomeVars
  const raw = vars[normalized]
  const value = (raw ?? '').trim()
  if (value) return value
  return (fallback ?? '').trim()
}

/** Espace fine insécable (typo FR avant ? ! : ;) */
const NNBSP = '\u202F'

function cleanupEmptyArtifacts(text: string): string {
  return text
    .replace(/\(\s*\)/g, '')
    // Compacter les espaces multiples (souvent laissés par une variable vide).
    .replace(/[^\S\n]+/g, ' ')
    // FR : espace avant . et , → retirer ; avant ? ! : ; → NNBSP.
    .replace(/ +([.,])/g, '$1')
    .replace(/ +([!?:;])/g, `${NNBSP}$1`)
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    // NNBSP orpheline en tête/fin (ex. « {{var}} ! » → « ! »).
    .replace(new RegExp(`^${NNBSP}+|${NNBSP}+$`, 'g'), '')
}

export function renderPortalWelcome(
  template: string | null | undefined,
  vars: PortalWelcomeVars,
): string {
  const source = (template ?? '').trim() || DEFAULT_PORTAL_WELCOME
  const replaced = source.replace(TOKEN_RE, (_match, key: string, fallback?: string) =>
    resolveTokenValue(key, fallback, vars),
  )
  return cleanupEmptyArtifacts(replaced)
}

export function renderPortalWelcomeHtml(
  template: string | null | undefined,
  vars: PortalWelcomeVars,
): string {
  return escapeHtml(renderPortalWelcome(template, vars)).replace(/\n/g, '<br>')
}
