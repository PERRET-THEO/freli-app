/**
 * Couche d'abstraction Google Gemini pour les Edge Functions Freli.
 *
 * Point d’entrée unique : chatJsonSchema, runOcr, logAiUsage, MODEL_*.
 * La clé (GEMINI_API_KEY) ne quitte jamais le serveur.
 */
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Modèles (alias stables pour les edges métier)
// ---------------------------------------------------------------------------

/** Modèle Gemini par défaut — surchargeable via secret GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

export const MODEL_SMALL = DEFAULT_GEMINI_MODEL
export const MODEL_LARGE = DEFAULT_GEMINI_MODEL
export const MODEL_OCR = DEFAULT_GEMINI_MODEL
/** Vision / fallback extraction (ex-Pixtral). */
export const MODEL_VISION = DEFAULT_GEMINI_MODEL
/** @deprecated Alias historique — préférer MODEL_VISION. */
export const MODEL_PIXTRAL = MODEL_VISION

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MAX_OUTPUT_TOKENS = 8192
const DEFAULT_TIMEOUT_MS = 90_000
const OCR_TIMEOUT_MS = 120_000
/** Budget total retries (429 / 5xx) pour une extraction — évite les workers zombies. */
export const EXTRACTION_RETRY_BUDGET_MS = 25_000

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface AiCallResult {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export interface AiUsageContext {
  agencyId?: string | null
  projectId?: string | null
  feature: 'extraction' | 'reminders' | 'contracts'
}

export interface OcrResult {
  markdown: string
  pages: Array<{
    index: number
    markdown: string
    header?: string
    footer?: string
    blocks?: unknown[]
  }>
  documentAnnotation: string | null
  model: string
  durationMs: number
}

// ---------------------------------------------------------------------------
// Config / auth
// ---------------------------------------------------------------------------

function getApiBase(): string {
  return (Deno.env.get('GEMINI_API_BASE_URL') ?? DEFAULT_API_BASE).replace(/\/$/, '')
}

function getApiKey(): string {
  const isDev =
    Deno.env.get('ENVIRONMENT') === 'development' || Deno.env.get('DENO_ENV') === 'development'
  const devKey = Deno.env.get('GEMINI_API_KEY_DEV') ?? ''
  const prodKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  const key = isDev && devKey ? devKey : prodKey || devKey
  if (!key) {
    throw new Error('GEMINI_API_KEY non configurée (supabase secrets set GEMINI_API_KEY=...)')
  }
  return key
}

function resolveModel(requested: string): string {
  const override = Deno.env.get('GEMINI_MODEL')?.trim()
  if (override) return override
  // Anciens ids Mistral encore présents dans des logs / configs → modèle Gemini courant
  if (requested.startsWith('mistral-') || requested.startsWith('pixtral-')) {
    return DEFAULT_GEMINI_MODEL
  }
  return requested
}

// ---------------------------------------------------------------------------
// Schémas JSON → Gemini
// ---------------------------------------------------------------------------

/**
 * Adapte un JSON Schema (types union `["string","null"]`, etc.)
 * vers le sous-ensemble attendu par Gemini `responseSchema`.
 * Exporté pour les tests unitaires.
 */
export function normalizeSchemaForGemini(schema: Record<string, unknown>): Record<string, unknown> {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit)
    if (!node || typeof node !== 'object') return node
    const obj = node as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'additionalProperties') continue
      if (key === 'type' && Array.isArray(value)) {
        const types = value.filter((t): t is string => typeof t === 'string')
        const nonNull = types.filter((t) => t !== 'null')
        if (types.includes('null') && nonNull.length === 1) {
          next.type = nonNull[0]
          next.nullable = true
          continue
        }
        if (nonNull.length === 1) {
          next.type = nonNull[0]
          continue
        }
      }
      next[key] = visit(value)
    }
    return next
  }
  return visit(schema) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** Identifiant court pour corréler UI ↔ logs serveur (jamais de JSON API côté client). */
export function newAiErrorId(): string {
  return `ai_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export type AiErrorKind = 'rate_limit' | 'auth' | 'unknown_document' | 'unknown'

export const RATE_LIMIT_USER_MESSAGE =
  'Service IA momentanément saturé. Réessayez dans quelques minutes.'

function unknownDocumentAnalysisMessage(errorId: string): string {
  return `Une erreur est survenue lors de l'analyse du document. Réessayez ou contactez le support (réf. ${errorId}).`
}

/** Strict : uniquement 429 / 503 / overloaded / high demand (pas timeout, pas quota générique). */
export function isProviderSaturationSignal(raw: string): boolean {
  const lower = raw.toLowerCase()
  return (
    /\b429\b/.test(raw) ||
    /\b503\b/.test(raw) ||
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('rate limit')
  )
}

/**
 * Traduit une erreur fournisseur en message FR sans JSON.
 * Le détail technique reste dans les logs (`errorId`).
 */
export function toUserFacingAiError(
  error: unknown,
  options?: {
    errorId?: string
    kind?: AiErrorKind
    /** Contexte logs (provider, model, HTTP, fichier…). */
    logContext?: Record<string, unknown>
  },
): { message: string; kind: AiErrorKind; errorId: string } {
  const errorId = options?.errorId ?? newAiErrorId()
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const lower = raw.toLowerCase()

  // Message déjà FR saturé (ex. formatGeminiHttpError 429/503) OU signaux provider bruts.
  if (
    options?.kind === 'rate_limit' ||
    raw === RATE_LIMIT_USER_MESSAGE ||
    isProviderSaturationSignal(raw)
  ) {
    return { message: RATE_LIMIT_USER_MESSAGE, kind: 'rate_limit', errorId }
  }

  if (
    options?.kind === 'unknown_document' ||
    lower.includes('type de document non reconnu')
  ) {
    return {
      message: "Type de document non reconnu (attendu : pièce d'identité, Kbis ou RIB).",
      kind: 'unknown_document',
      errorId,
    }
  }

  if (options?.kind === 'auth' || /\b401\b/.test(raw) || /\b403\b/.test(raw)) {
    return {
      message: 'Service IA indisponible. Réessayez plus tard.',
      kind: 'auth',
      errorId,
    }
  }

  // Ne jamais renvoyer tel quel un message déjà FR « saturé » si le kind n'est pas rate_limit
  // (ex. timeout mappé par erreur) — ni exposer JSON / payloads API.
  console.error('[ai-provider] toUserFacingAiError unknown', {
    errorId,
    raw: raw.slice(0, 500),
    ...options?.logContext,
  })

  return {
    message: unknownDocumentAnalysisMessage(errorId),
    kind: 'unknown',
    errorId,
  }
}

function formatGeminiHttpError(status: number, bodyText: string): string {
  const bodyLower = bodyText.toLowerCase()
  if (
    status === 429 ||
    status === 503 ||
    bodyLower.includes('overloaded') ||
    bodyLower.includes('high demand')
  ) {
    return RATE_LIMIT_USER_MESSAGE
  }
  if (status === 401 || status === 403) {
    return 'Service IA indisponible. Réessayez plus tard.'
  }
  const errorId = newAiErrorId()
  console.error(`[ai-provider] http_${status} errorId=${errorId} provider=gemini body=`, bodyText.slice(0, 500))
  return `gemini_http_${status}:${errorId}`
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const asInt = Number(header)
  if (Number.isFinite(asInt) && asInt >= 0) return Math.min(asInt * 1000, 60_000)
  const asDate = Date.parse(header)
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), 60_000)
  }
  return null
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  deadlineAt?: number,
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const remaining =
      typeof deadlineAt === 'number' ? deadlineAt - Date.now() : Number.POSITIVE_INFINITY
    if (remaining <= 0) {
      throw lastError ?? new Error('Gemini API: budget retries dépassé')
    }
    if (attempt > 0) {
      const backoff = Math.min(1000 * 2 ** attempt, remaining)
      await new Promise((resolve) => setTimeout(resolve, backoff))
      if (typeof deadlineAt === 'number' && Date.now() >= deadlineAt) {
        throw lastError ?? new Error('Gemini API: budget retries dépassé')
      }
    }
    const attemptTimeout = Math.min(
      timeoutMs,
      Number.isFinite(remaining) ? Math.max(1_000, remaining) : timeoutMs,
    )
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), attemptTimeout)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (response.status === 401 || response.status === 403) {
        throw new Error(formatGeminiHttpError(response.status, await response.text()))
      }
      if (response.status === 429) {
        const bodyText = await response.text()
        const errorId = newAiErrorId()
        console.error(
          `[ai-provider] 429 errorId=${errorId} attempt=${attempt} retry-after=${response.headers.get('retry-after')} body=`,
          bodyText.slice(0, 500),
        )
        lastError = new Error(RATE_LIMIT_USER_MESSAGE)
        if (attempt < maxRetries) {
          const retryAfter = parseRetryAfterMs(response)
          const delay = retryAfter ?? 1000 * 2 ** (attempt + 1)
          const wait = typeof deadlineAt === 'number'
            ? Math.min(delay, Math.max(0, deadlineAt - Date.now()))
            : delay
          if (wait <= 0) throw lastError
          await new Promise((resolve) => setTimeout(resolve, wait))
          continue
        }
        throw lastError
      }
      if (response.status >= 500) {
        lastError = new Error(formatGeminiHttpError(response.status, await response.text()))
        continue
      }
      return response
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        lastError = new Error(`Gemini API timeout après ${attemptTimeout}ms`)
        continue
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('Gemini API: échec après retries')
}

// ---------------------------------------------------------------------------
// generateContent (interne)
// ---------------------------------------------------------------------------

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
    totalTokenCount?: number
  }
  modelVersion?: string
}

function extractResponseText(payload: GeminiGenerateResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? []
  // Ignorer les parts "thought" (reasoning interne Gemini 3.x).
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()
}

function parseJsonResponse<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`Réponse Gemini invalide (${context}): JSON non parsable`)
  }
}

async function generateContent(options: {
  model: string
  system?: string
  parts: GeminiPart[]
  maxTokens?: number
  temperature?: number
  responseSchema?: Record<string, unknown>
  timeoutMs?: number
  /** Horodatage absolu (Date.now()) au-delà duquel les retries s'arrêtent. */
  deadlineAt?: number
}): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }> {
  const apiKey = getApiKey()
  const model = resolveModel(options.model)
  const url = `${getApiBase()}/models/${encodeURIComponent(model)}:generateContent`

  // thinkingLevel "low" : latence/coût adaptés aux modules Freli.
  // maxOutputTokens assez haut car le thinking consomme le budget.
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    thinkingConfig: { thinkingLevel: 'low' },
  }
  if (options.temperature != null) {
    generationConfig.temperature = options.temperature
  }
  if (options.responseSchema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema = normalizeSchemaForGemini(options.responseSchema)
  }

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: options.parts }],
    generationConfig,
  }
  if (options.system?.trim()) {
    body.systemInstruction = { parts: [{ text: options.system }] }
  }

  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
    2,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.deadlineAt,
  )

  if (!response.ok) {
    throw new Error(formatGeminiHttpError(response.status, await response.text()))
  }

  const payload = (await response.json()) as GeminiGenerateResponse
  const text = extractResponseText(payload)
  if (!text) {
    const finish = payload.candidates?.[0]?.finishReason ?? 'unknown'
    throw new Error(`Réponse Gemini vide (finishReason=${finish})`)
  }

  return {
    text,
    model: payload.modelVersion ?? model,
    inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Usage / coûts
// ---------------------------------------------------------------------------

/** Estimation coût USD → centimes EUR approximatifs (ordre de grandeur). */
export function estimateCostCents(args: {
  operation: 'ocr' | 'chat' | 'vision'
  model: string
  inputTokens?: number
  outputTokens?: number
}): number {
  const inTok = args.inputTokens ?? 0
  const outTok = args.outputTokens ?? 0
  if (args.operation === 'ocr') return 0.2
  const inPerM = 0.3
  const outPerM = 2.5
  const usd = (inTok * inPerM + outTok * outPerM) / 1_000_000
  return Math.round(usd * 0.92 * 100 * 10_000) / 10_000
}

/** Journalise la consommation de tokens (fire-and-forget). */
export async function logAiUsage(
  supabase: SupabaseClient,
  entry: AiUsageContext & {
    operation: 'ocr' | 'chat' | 'vision'
    model: string
    inputTokens?: number
    outputTokens?: number
    durationMs?: number
    success?: boolean
    errorMessage?: string | null
    promptVersion?: string | null
    creditsConsumed?: number
  },
): Promise<void> {
  try {
    const estimated = estimateCostCents({
      operation: entry.operation,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
    })
    await supabase.from('ai_usage_logs').insert({
      agency_id: entry.agencyId ?? null,
      project_id: entry.projectId ?? null,
      feature: entry.feature,
      operation: entry.operation,
      model: entry.model,
      input_tokens: entry.inputTokens ?? 0,
      output_tokens: entry.outputTokens ?? 0,
      duration_ms: entry.durationMs ?? null,
      success: entry.success !== false,
      error_message: entry.errorMessage ?? null,
      estimated_cost_cents: estimated,
      prompt_version: entry.promptVersion ?? null,
      credits_consumed: entry.creditsConsumed ?? 0,
    })
  } catch (error) {
    console.warn('logAiUsage failed:', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

function buildOcrResponseSchema(
  annotationSchema?: Record<string, unknown>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    markdown: {
      type: 'string',
      description: 'Texte OCR complet du document en markdown',
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          markdown: { type: 'string' },
          header: { type: 'string', nullable: true },
          footer: { type: 'string', nullable: true },
        },
        required: ['index', 'markdown'],
      },
    },
  }
  const required = ['markdown', 'pages']
  if (annotationSchema) {
    properties.document_annotation = annotationSchema
    required.push('document_annotation')
  }
  return { type: 'object', properties, required }
}

/** OCR multimodal (PDF / image → markdown + annotation JSON optionnelle). */
export async function runOcr(options: {
  mediaType: string
  base64: string
  annotationSchema?: Record<string, unknown>
  annotationSchemaName?: string
  includeBlocks?: boolean
  tableFormat?: 'html' | 'markdown' | null
  extractHeader?: boolean
  extractFooter?: boolean
  deadlineAt?: number
}): Promise<OcrResult> {
  const start = Date.now()
  const responseSchema = buildOcrResponseSchema(options.annotationSchema)

  const instructions = [
    'Extrais le texte du document fourni.',
    'Retourne le contenu en markdown fidèle (sans inventer).',
    'Découpe par page dans "pages" si possible ; sinon une seule page index 0.',
    options.extractHeader ? 'Renseigne header si présent.' : null,
    options.extractFooter ? 'Renseigne footer si présent.' : null,
    options.annotationSchema
      ? `Remplis aussi "document_annotation" selon le schéma (${options.annotationSchemaName ?? 'annotation'}).`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const timeoutMs =
    typeof options.deadlineAt === 'number'
      ? Math.min(OCR_TIMEOUT_MS, Math.max(1_000, options.deadlineAt - Date.now()))
      : OCR_TIMEOUT_MS

  const result = await generateContent({
    model: MODEL_OCR,
    system: 'Tu es un moteur OCR précis pour documents français (identité, Kbis, RIB, contrats).',
    parts: [
      { text: instructions },
      { inline_data: { mime_type: options.mediaType, data: options.base64 } },
    ],
    maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: 0,
    responseSchema,
    timeoutMs,
    deadlineAt: options.deadlineAt,
  })

  const parsed = parseJsonResponse<{
    markdown?: string
    pages?: Array<{
      index?: number
      markdown?: string
      header?: string
      footer?: string
      blocks?: unknown[]
    }>
    document_annotation?: unknown
  }>(result.text, 'ocr')

  const pages = (parsed.pages ?? []).map((page, index) => ({
    index: page.index ?? index,
    markdown: page.markdown ?? '',
    header: page.header,
    footer: page.footer,
    blocks: page.blocks,
  }))
  const markdown =
    (typeof parsed.markdown === 'string' && parsed.markdown) ||
    pages.map((p) => p.markdown).filter(Boolean).join('\n\n')

  let documentAnnotation: string | null = null
  if (parsed.document_annotation != null) {
    documentAnnotation =
      typeof parsed.document_annotation === 'string'
        ? parsed.document_annotation
        : JSON.stringify(parsed.document_annotation)
  }

  return {
    markdown,
    pages: pages.length > 0 ? pages : [{ index: 0, markdown }],
    documentAnnotation,
    model: result.model,
    durationMs: Date.now() - start,
  }
}

// ---------------------------------------------------------------------------
// Chat JSON
// ---------------------------------------------------------------------------

/** Appel chat avec sortie JSON Schema stricte. */
export async function chatJsonSchema<T = Record<string, unknown>>(options: {
  model: string
  system: string
  user: string
  schema: Record<string, unknown>
  schemaName: string
  maxTokens?: number
  temperature?: number
  imageMediaType?: string
  imageBase64?: string
  deadlineAt?: number
}): Promise<AiCallResult & { parsed: T }> {
  const start = Date.now()

  const parts: GeminiPart[] = [{ text: options.user }]
  if (options.imageBase64 && options.imageMediaType) {
    parts.push({
      inline_data: { mime_type: options.imageMediaType, data: options.imageBase64 },
    })
  }

  const result = await generateContent({
    model: options.model,
    system: options.system,
    parts,
    maxTokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0,
    responseSchema: options.schema,
    deadlineAt: options.deadlineAt,
  })

  const parsed = parseJsonResponse<T>(result.text, options.schemaName)
  const callResult: AiCallResult = {
    text: result.text,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: Date.now() - start,
  }

  console.log(
    `Gemini ${options.schemaName} ok — model=${callResult.model} in=${callResult.inputTokens} out=${callResult.outputTokens}`,
  )

  return { ...callResult, parsed }
}

// ---------------------------------------------------------------------------
// Utilitaires extraction
// ---------------------------------------------------------------------------

/** Extrait le premier objet JSON (fallback si sortie non strictement JSON). */
export function parseJsonOutput<T = Record<string, unknown>>(raw: string): T {
  const trimmed = raw.trim()
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Réponse IA invalide : aucun objet JSON détecté')
  }
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as T
  } catch {
    throw new Error('Réponse IA invalide : JSON non parsable')
  }
}

/** Normalise un objet extrait : chaque champ vaut string non vide ou null. */
export function normalizeToSchema(
  data: Record<string, unknown>,
  fields: string[],
): Record<string, string | null> {
  const normalized: Record<string, string | null> = {}
  for (const field of fields) {
    const value = data[field]
    if (typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'null') {
      normalized[field] = value.trim()
    } else {
      normalized[field] = null
    }
  }
  return normalized
}

/** Convertit un ArrayBuffer en base64 sans dépasser la pile d'appel. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Compte les champs null — déclenche le fallback vision si trop élevé. */
export function nullFieldRatio(fields: Record<string, string | null>): number {
  const values = Object.values(fields)
  if (values.length === 0) return 1
  const nullCount = values.filter((v) => v === null).length
  return nullCount / values.length
}
