/**
 * Couche d'abstraction Mistral AI pour les Edge Functions Freli.
 *
 * Tous les appels IA passent par ce module : la clé API (MISTRAL_API_KEY)
 * ne quitte jamais le serveur. Permet de changer de modèle ou de fournisseur
 * sans réécrire la logique métier des Edge Functions.
 */
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mistralJsonSchema } from './documentSchemas.ts'

export const MODEL_OCR = 'mistral-ocr-latest'
export const MODEL_SMALL = 'mistral-small-latest'
export const MODEL_LARGE = 'mistral-large-latest'
export const MODEL_PIXTRAL = 'pixtral-large-latest' // vision-langage (fallback F1)

const DEFAULT_API_BASE = 'https://api.mistral.ai/v1'

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
  pages: Array<{ index: number; markdown: string; header?: string; footer?: string; blocks?: unknown[] }>
  documentAnnotation: string | null
  model: string
  durationMs: number
}

function getApiBase(): string {
  return (Deno.env.get('MISTRAL_API_BASE_URL') ?? DEFAULT_API_BASE).replace(/\/$/, '')
}

function getApiKey(): string {
  const isDev =
    Deno.env.get('ENVIRONMENT') === 'development' || Deno.env.get('DENO_ENV') === 'development'
  const devKey = Deno.env.get('MISTRAL_API_KEY_DEV') ?? ''
  const prodKey = Deno.env.get('MISTRAL_API_KEY') ?? ''
  const key = isDev && devKey ? devKey : prodKey || devKey
  if (!key) throw new Error('MISTRAL_API_KEY non configurée (supabase secrets set)')
  return key
}

function dataUrlForDocument(mediaType: string, base64: string): Record<string, string> {
  const dataUrl = `data:${mediaType};base64,${base64}`
  if (mediaType === 'application/pdf') {
    return { type: 'document_url', document_url: dataUrl }
  }
  return { type: 'image_url', image_url: dataUrl }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
  timeoutMs = 90_000,
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Mistral API ${response.status}: ${await response.text()}`)
        continue
      }
      return response
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        lastError = new Error(`Mistral API timeout après ${timeoutMs}ms`)
        continue
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('Mistral API: échec après retries')
}

/** Estimation coût USD → centimes EUR approximatifs (ordre de grandeur). */
export function estimateCostCents(args: {
  operation: 'ocr' | 'chat' | 'vision'
  model: string
  inputTokens?: number
  outputTokens?: number
}): number {
  const inTok = args.inputTokens ?? 0
  const outTok = args.outputTokens ?? 0
  // Tarifs indicatifs Mistral 2026 ($ / 1M tokens) convertis ~×0.92 € puis ×100 centimes
  let inPerM = 0.1
  let outPerM = 0.3
  if (args.operation === 'ocr') {
    // ~$4 / 1000 pages → ~0.4 cent/page ; on approxime 1 appel OCR = 0.4¢
    return 0.4
  }
  if (args.model.includes('large') || args.model.includes('pixtral')) {
    inPerM = 2
    outPerM = 6
  } else if (args.model.includes('small')) {
    inPerM = 0.1
    outPerM = 0.3
  }
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

/** OCR Mistral avec annotation JSON optionnelle et extraction de structure. */
export async function runOcr(options: {
  mediaType: string
  base64: string
  annotationSchema?: Record<string, unknown>
  annotationSchemaName?: string
  includeBlocks?: boolean
  tableFormat?: 'html' | 'markdown' | null
  extractHeader?: boolean
  extractFooter?: boolean
}): Promise<OcrResult> {
  const start = Date.now()
  const apiKey = getApiKey()
  const body: Record<string, unknown> = {
    model: MODEL_OCR,
    document: dataUrlForDocument(options.mediaType, options.base64),
  }
  if (options.annotationSchema) {
    body.document_annotation_format = mistralJsonSchema(
      options.annotationSchemaName ?? 'document_annotation',
      options.annotationSchema,
    )
  }
  if (options.includeBlocks) body.include_blocks = true
  if (options.tableFormat) body.table_format = options.tableFormat
  if (options.extractHeader) body.extract_header = true
  if (options.extractFooter) body.extract_footer = true

  const response = await fetchWithRetry(`${getApiBase()}/ocr`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, 2, 120_000)

  if (!response.ok) {
    throw new Error(`Mistral OCR ${response.status}: ${await response.text()}`)
  }

  const payload = (await response.json()) as {
    pages?: Array<{
      index?: number
      markdown?: string
      header?: string
      footer?: string
      blocks?: unknown[]
    }>
    document_annotation?: string | null
    model?: string
  }

  const pages = (payload.pages ?? []).map((page, index) => ({
    index: page.index ?? index,
    markdown: page.markdown ?? '',
    header: page.header,
    footer: page.footer,
    blocks: page.blocks,
  }))
  const markdown = pages.map((p) => p.markdown).filter(Boolean).join('\n\n')

  return {
    markdown,
    pages,
    documentAnnotation: payload.document_annotation ?? null,
    model: payload.model ?? MODEL_OCR,
    durationMs: Date.now() - start,
  }
}

/** Appel chat Mistral avec sortie JSON Schema stricte. */
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
}): Promise<AiCallResult & { parsed: T }> {
  const start = Date.now()
  const apiKey = getApiKey()

  let userContent: string | Array<Record<string, unknown>>
  if (options.imageBase64 && options.imageMediaType) {
    const dataUrl = `data:${options.imageMediaType};base64,${options.imageBase64}`
    userContent = [
      { type: 'text', text: options.user },
      { type: 'image_url', image_url: dataUrl },
    ]
  } else {
    userContent = options.user
  }

  const response = await fetchWithRetry(`${getApiBase()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: userContent },
      ],
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      response_format: mistralJsonSchema(options.schemaName, options.schema),
    }),
  })

  if (!response.ok) {
    throw new Error(`Mistral chat ${response.status}: ${await response.text()}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const text = payload.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Réponse Mistral vide')

  const parsed = JSON.parse(text) as T
  const result: AiCallResult = {
    text,
    model: payload.model ?? options.model,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - start,
  }

  console.log(
    `Mistral ${options.schemaName} ok — model=${result.model} in=${result.inputTokens} out=${result.outputTokens}`,
  )

  return { ...result, parsed }
}

/**
 * Extrait le premier objet JSON de la réponse du modèle (fallback legacy).
 * Tolère les fences markdown mais json_schema devrait rendre cela inutile.
 */
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

/** Compte les champs null — déclenche le fallback Pixtral si trop élevé. */
export function nullFieldRatio(fields: Record<string, string | null>): number {
  const values = Object.values(fields)
  if (values.length === 0) return 1
  const nullCount = values.filter((v) => v === null).length
  return nullCount / values.length
}
