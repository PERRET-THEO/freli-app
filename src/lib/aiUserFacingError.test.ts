import { describe, expect, it } from 'vitest'
import { isRateLimitAiMessage, sanitizeAiErrorMessage } from './aiUserFacingError'

describe('sanitizeAiErrorMessage', () => {
  it('maps Mistral/Gemini 429 JSON to friendly FR', () => {
    const raw =
      'Extraction échouée : Mistral API 429: {"object":"error","message":"Rate limit exceeded","type":"rate_limit"}'
    expect(sanitizeAiErrorMessage(raw)).toBe(
      'Service IA momentanément saturé. Réessayez dans quelques minutes.',
    )
    expect(isRateLimitAiMessage(raw)).toBe(true)
  })

  it('maps Gemini 503 / high demand to friendly FR', () => {
    const raw =
      'Erreur Gemini (503): This model is currently experiencing high demand. Please try again later.'
    expect(sanitizeAiErrorMessage(raw)).toBe(
      'Service IA momentanément saturé. Réessayez dans quelques minutes.',
    )
    expect(isRateLimitAiMessage(raw)).toBe(true)
  })

  it('maps overloaded provider messages to friendly FR', () => {
    expect(sanitizeAiErrorMessage('The model is overloaded. Please try again later.')).toBe(
      'Service IA momentanément saturé. Réessayez dans quelques minutes.',
    )
  })

  it('keeps unknown document message', () => {
    expect(
      sanitizeAiErrorMessage(
        "Type de document non reconnu (attendu : pièce d'identité, Kbis ou RIB).",
      ),
    ).toMatch(/non reconnu/)
  })

  it('maps unknown / timeout to document analysis message (not saturation)', () => {
    expect(sanitizeAiErrorMessage('Gemini API timeout après 25000ms')).toMatch(
      /analyse du document/,
    )
    expect(sanitizeAiErrorMessage('gemini_http_500:ai_abc123')).toMatch(/analyse du document/)
    expect(isRateLimitAiMessage('Gemini API timeout après 25000ms')).toBe(false)
  })

  it('keeps file-missing message (not saturation)', () => {
    expect(sanitizeAiErrorMessage("Le fichier n'est plus disponible — demandez au client de le renvoyer")).toBe(
      "Le fichier n'est plus disponible — demandez au client de le renvoyer",
    )
    expect(sanitizeAiErrorMessage('Chemin de fichier absent')).toBe(
      "Le fichier n'est plus disponible — demandez au client de le renvoyer",
    )
  })

  it('preserves unknown analysis message with ref', () => {
    const msg =
      "Une erreur est survenue lors de l'analyse du document. Réessayez ou contactez le support (réf. ai_cfb0c9b23809)."
    expect(sanitizeAiErrorMessage(msg)).toBe(msg)
  })
})
