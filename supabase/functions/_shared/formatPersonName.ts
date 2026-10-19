/** Miroir de src/lib/formatPersonName.ts pour les Edge Functions. */

const NAME_PARTICLES = new Set(['de', 'du', 'des', 'van', 'von', 'da', 'di', 'le', 'la'])

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
