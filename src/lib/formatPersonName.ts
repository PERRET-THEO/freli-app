/** Title-case for display only — does not mutate stored values. */
export function formatPersonName(firstName: string, lastName: string): string {
  return [titleCaseWord(firstName), titleCaseWord(lastName)].filter(Boolean).join(' ').trim()
}

export function formatPersonInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0)
  const b = lastName.trim().charAt(0)
  return `${a}${b}`.toUpperCase() || '?'
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
