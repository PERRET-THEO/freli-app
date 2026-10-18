const UUID_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i

/** Nom de fichier affiché : retire le préfixe uuid- des paths storage. */
export function displayDocumentFilename(pathOrName: string): string {
  const base = pathOrName.split('/').pop() ?? pathOrName
  return base.replace(UUID_PREFIX, '') || base
}

/**
 * Documents d'identité / société / banque à passer à l'extraction IA.
 * Logos, DA, briefs fichiers, etc. sont exclus.
 */
export function isExtractableDocumentItem(item: {
  type: string
  label: string
  config?: { extractDocument?: boolean } | null
}): boolean {
  if (item.type !== 'file') return false
  if (item.config?.extractDocument === true) return true
  if (item.config?.extractDocument === false) return false
  const label = item.label.trim().toLowerCase()
  return (
    /kbis|extrait\s+k|rcs/.test(label) ||
    /\brib\b|iban|relev[eé]\s+d['']?identit[eé]\s+bancaire|coordonn[eé]es\s+bancaires/.test(
      label,
    ) ||
    /\bcni\b|pi[eè]ce\s+d['']?identit|passeport|carte\s+d['']?identit|titre\s+de\s+s[eé]jour/.test(
      label,
    )
  )
}
