export type PortalWelcomeVars = {
  'client.prenom'?: string | null
  'client.entreprise'?: string | null
  'projet.nom'?: string | null
  'agence.nom'?: string | null
}

export const PORTAL_WELCOME_VARIABLES = [
  { key: 'client.prenom' as const, label: 'Prénom du client', token: '{{client.prenom}}' },
  { key: 'client.entreprise' as const, label: 'Entreprise du client', token: '{{client.entreprise}}' },
  { key: 'projet.nom' as const, label: 'Nom du projet', token: '{{projet.nom}}' },
  { key: 'agence.nom' as const, label: 'Nom de l’agence', token: '{{agence.nom}}' },
]

export const DEFAULT_PORTAL_WELCOME =
  'Complétez les étapes ci-dessous pour démarrer votre projet. Cela prend environ 10 minutes.'

export const DEFAULT_PORTAL_HELP_TITLE = 'Besoin d’aide ?'

/** `{{key}}` ou `{{key|texte de repli}}` */
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

/**
 * Remplace les variables ; valeur vide → repli `|…` puis nettoyage.
 * Sortie texte brut (pas de HTML).
 */
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

/**
 * Pour emails HTML : rend en texte, échappe le résultat, puis `\n` → `<br>`.
 */
export function renderPortalWelcomeHtml(
  template: string | null | undefined,
  vars: PortalWelcomeVars,
): string {
  return escapeHtml(renderPortalWelcome(template, vars)).replace(/\n/g, '<br>')
}

export function insertWelcomeVariable(template: string, token: string, cursor?: number): string {
  if (cursor == null || cursor < 0 || cursor > template.length) {
    return `${template}${token}`
  }
  return `${template.slice(0, cursor)}${token}${template.slice(cursor)}`
}
