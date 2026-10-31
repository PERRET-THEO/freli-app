export type AiErrorKind = 'rate_limit' | 'auth' | 'unknown_document' | 'unknown'

const RATE_LIMIT_USER_MESSAGE =
  'Service IA momentanément saturé. Réessayez dans quelques minutes.'

/** Strict : 429 / 503 / overloaded / high demand / « rate limit » — pas timeout ni quota générique. */
function isSaturationSignal(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    /\b429\b/.test(text) ||
    /\b503\b/.test(text) ||
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('rate limit')
  )
}

/**
 * Sanitize les messages d'erreur IA déjà persistés (ex. JSON Mistral/Gemini).
 * Miroir de toUserFacingAiError côté Edge.
 */
export function sanitizeAiErrorMessage(raw: string | null | undefined): string {
  if (!raw?.trim()) {
    return "Une erreur est survenue lors de l'analyse du document. Réessayez ou contactez le support."
  }
  const text = raw.trim()
  const lower = text.toLowerCase()
  const refMatch = text.match(/réf\.\s*(ai_[a-z0-9_]+)/i)
  const refSuffix = refMatch ? ` (réf. ${refMatch[1]})` : ''

  // Fichier Storage absent — ne pas confondre avec saturation / type inconnu.
  if (
    lower.includes("n'est plus disponible") ||
    lower.includes('chemin de fichier absent') ||
    lower.includes('file_missing')
  ) {
    return "Le fichier n'est plus disponible — demandez au client de le renvoyer"
  }

  if (isSaturationSignal(text)) {
    return RATE_LIMIT_USER_MESSAGE
  }

  // Message déjà saturé persisté : ne le garder que s'il n'y a pas d'indice d'autre cause.
  // (Les anciens timeouts mal classés restent affichés saturé — les nouveaux unknown ont une réf.)
  if (text === RATE_LIMIT_USER_MESSAGE) {
    return RATE_LIMIT_USER_MESSAGE
  }

  if (lower.includes('type de document non reconnu')) {
    return "Type de document non reconnu (attendu : pièce d'identité, Kbis ou RIB)."
  }

  if (
    lower.includes("lors de l'analyse du document") ||
    lower.includes('lors de l’analyse du document')
  ) {
    return text.length > 220 ? text.slice(0, 220) : text
  }

  // Corps JSON / payloads / codes internes / timeouts provider → message unknown FR.
  if (
    text.includes('{"object"') ||
    text.includes('"message"') ||
    /mistral api|gemini api|gemini_http_|timeout|budget retries/i.test(text) ||
    (text.includes('{') && text.includes('}')) ||
    text.length > 220
  ) {
    return `Une erreur est survenue lors de l'analyse du document. Réessayez ou contactez le support${refSuffix || '.'}`
  }

  return text
}

export function isRateLimitAiMessage(message: string): boolean {
  return sanitizeAiErrorMessage(message) === RATE_LIMIT_USER_MESSAGE
}
