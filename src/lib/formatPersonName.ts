const NAME_PARTICLES = new Set(['de', 'du', 'des', 'van', 'von', 'da', 'di', 'le', 'la'])

/** Title-case for display only — does not mutate stored values. */
export function formatPersonName(firstName: string, lastName: string): string {
  return [formatDisplayName(firstName), formatDisplayName(lastName)].filter(Boolean).join(' ').trim()
}

export function formatPersonInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0)
  const b = lastName.trim().charAt(0)
  return `${a}${b}`.toUpperCase() || '?'
}

/**
 * Title-case a person name for display (particles stay lowercase).
 * Do not use on company / trade names.
 */
export function formatDisplayName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return ''

  return trimmed
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part
      const lower = part.toLowerCase()
      if (NAME_PARTICLES.has(lower)) return lower
      return titleCaseWord(part)
    })
    .join('')
}

/**
 * Retire le sigle SIRENE en fin de raison sociale : « HEPPNER EN FOREZ (HEF) » → « HEPPNER EN FOREZ ».
 * N’altère pas le reste du nom.
 */
export function stripSireneAcronym(companyName: string): string {
  return companyName.replace(/\s*\([A-Z0-9]{2,10}\)\s*$/u, '').trim()
}

function titleCaseWord(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value) return ''
  return value
    .split(/([\s'-]+)/)
    .map((part) => {
      if (/^[\s'-]+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}
