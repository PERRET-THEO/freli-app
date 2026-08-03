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

const TOKEN_RE = /\{\{\s*([a-z.]+)\s*\}\}/gi

/** Remplace les variables ; valeurs vides → chaîne vide. Sortie texte brut (pas de HTML). */
export function renderPortalWelcome(
  template: string | null | undefined,
  vars: PortalWelcomeVars,
): string {
  const source = (template ?? '').trim() || DEFAULT_PORTAL_WELCOME
  return source.replace(TOKEN_RE, (_match, key: string) => {
    const normalized = key.trim().toLowerCase() as keyof PortalWelcomeVars
    const value = vars[normalized]
    return (value ?? '').trim()
  })
}

export function insertWelcomeVariable(template: string, token: string, cursor?: number): string {
  if (cursor == null || cursor < 0 || cursor > template.length) {
    return `${template}${token}`
  }
  return `${template.slice(0, cursor)}${token}${template.slice(cursor)}`
}
