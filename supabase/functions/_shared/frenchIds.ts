/**
 * Validation déterministe des identifiants FR (SIREN/SIRET) — Luhn.
 */
export function isValidSiren(raw: string): boolean {
  const digits = raw.replace(/\s+/g, '')
  if (!/^\d{9}$/.test(digits)) return false
  return luhnCheck(digits)
}

export function isValidSiret(raw: string): boolean {
  const digits = raw.replace(/\s+/g, '')
  if (!/^\d{14}$/.test(digits)) return false
  // La Poste (356000000) : exception historique sans Luhn sur SIRET
  if (digits.startsWith('356000000')) return true
  return luhnCheck(digits)
}

function luhnCheck(digits: string): boolean {
  let sum = 0
  const len = digits.length
  for (let i = 0; i < len; i++) {
    let n = Number(digits[len - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}
