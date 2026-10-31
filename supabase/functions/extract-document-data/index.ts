/**
 * Extraction IA de données depuis un document uploadé par le client.
 *
 * Pipeline Gemini : OCR multimodal (classification + markdown) → chat JSON
 * → fallback vision (même modèle) si trop de champs null.
 * Résultat en pending_review : validation humaine obligatoire.
 *
 * Crédit débité uniquement si l'extraction aboutit (pending_review).
 * Budget retries ≤ 25 s ; la ligne est toujours finalisée (failed) en finally.
 * Validations (chemin, storage) AVANT passage en processing.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  arrayBufferToBase64,
  chatJsonSchema,
  EXTRACTION_RETRY_BUDGET_MS,
  logAiUsage,
  MODEL_SMALL,
  MODEL_VISION,
  newAiErrorId,
  normalizeToSchema,
  nullFieldRatio,
  runOcr,
  toUserFacingAiError,
} from '../_shared/ai-provider.ts'
import {
  CLASSIFICATION_JSON_SCHEMA,
  DOCUMENT_FIELD_LISTS,
  EXTRACTION_JSON_SCHEMAS,
} from '../_shared/documentSchemas.ts'
import { assertAiAddonActive, consumeAiCredit } from '../_shared/aiEntitlements.ts'
import {
  EXTRACTION_PROMPT_VERSION,
  heuristicFieldConfidence,
  parseExtractionFields,
} from '../_shared/aiValidation.ts'
import { isValidSiren, isValidSiret } from '../_shared/frenchIds.ts'
import { isValidIban } from '../_shared/iban.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

const RATE_LIMIT_USER_MESSAGE =
  'Service IA momentanément saturé. Réessayez dans quelques minutes.'
export const FILE_MISSING_USER_MESSAGE =
  "Le fichier n'est plus disponible — demandez au client de le renvoyer"
const PROCESSING_STALE_MS = 2 * 60_000

type Body = {
  projectToken: string
  /** Requis : le path est lu en base, jamais fourni par le client. */
  checklistItemId: string
  /** Retry dashboard : réutilise storage_path de cette ligne. */
  extractionId?: string
}

export const DOCUMENT_SCHEMAS = DOCUMENT_FIELD_LISTS

const EXTRACTION_SYSTEM = `Tu es un moteur d'extraction de données documentaires pour un logiciel d'onboarding client français.
Tu reçois le texte OCR d'un document (pièce d'identité, Kbis ou RIB) et le type déjà classifié.

Règles impératives :
- Extrais uniquement les champs du schéma JSON fourni.
- Un champ illisible, absent ou incertain vaut null. N'invente JAMAIS une valeur.
- Ne complète JAMAIS un numéro partiellement lisible.
- Dates au format JJ/MM/AAAA si détectées.
- IBAN sans espaces. SIREN 9 chiffres, SIRET 14 chiffres.`

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

type ExtractionPayload = {
  document_type?: string
  fields?: Record<string, unknown>
}

async function extractFieldsFromOcr(options: {
  documentType: string
  ocrMarkdown: string
  mediaType: string
  base64: string
  agencyId: string
  projectId: string
  useVision: boolean
  deadlineAt: number
}): Promise<{ fields: Record<string, string | null>; model: string; pipeline: string }> {
  const schema = EXTRACTION_JSON_SCHEMAS[options.documentType]
  if (!schema) {
    return { fields: {}, model: MODEL_SMALL, pipeline: 'ocr_chat' }
  }

  const userPrompt = [
    `Type de document : ${options.documentType}`,
    `Texte OCR du document :`,
    options.ocrMarkdown || '(texte OCR vide — utilise la vision si disponible)',
    `Extrais les champs selon le schéma JSON.`,
  ].join('\n\n')

  const result = await chatJsonSchema<ExtractionPayload>({
    model: options.useVision ? MODEL_VISION : MODEL_SMALL,
    system: EXTRACTION_SYSTEM,
    user: userPrompt,
    schema,
    schemaName: `extract_${options.documentType}`,
    maxTokens: 1500,
    temperature: 0,
    imageMediaType: options.useVision ? options.mediaType : undefined,
    imageBase64: options.useVision ? options.base64 : undefined,
    deadlineAt: options.deadlineAt,
  })

  await logAiUsage(supabase, {
    agencyId: options.agencyId,
    projectId: options.projectId,
    feature: 'extraction',
    operation: options.useVision ? 'vision' : 'chat',
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: result.durationMs,
    promptVersion: EXTRACTION_PROMPT_VERSION,
  })

  const parsed = parseExtractionFields(
    options.documentType,
    result.parsed.fields ?? normalizeToSchema(
      result.parsed.fields ?? {},
      DOCUMENT_SCHEMAS[options.documentType],
    ),
  )
  const fields = parsed.ok
    ? parsed.fields
    : normalizeToSchema(result.parsed.fields ?? {}, DOCUMENT_SCHEMAS[options.documentType])

  return {
    fields,
    model: result.model,
    pipeline: options.useVision ? 'vision_fallback' : 'ocr_chat',
  }
}

/** Finalise en failed quel que soit le statut courant (pas seulement processing). */
async function finalizeFailed(extractionId: string, message: string): Promise<void> {
  await supabase
    .from('extracted_document_data')
    .update({ status: 'failed', error_message: message })
    .eq('id', extractionId)
}

function isStorageNotFound(error: { message?: string } | null | undefined): boolean {
  const msg = (error?.message ?? '').toLowerCase()
  return (
    msg.includes('not found') ||
    msg.includes('object not found') ||
    msg.includes('no such file') ||
    msg.includes('404')
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let extractionId: string | null = null
  let terminal = false
  let logMediaType: string | null = null
  let logFileBytes: number | null = null
  let logStoragePath: string | null = null

  try {
    const body = (await req.json()) as Body
    const projectToken = body.projectToken?.trim()
    const checklistItemId = body.checklistItemId?.trim()
    const requestedExtractionId = body.extractionId?.trim() || null
    if (!projectToken || !checklistItemId) {
      return jsonResponse({ error: 'projectToken et checklistItemId requis' }, 400)
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, agency_id, token, agencies(ai_extraction_enabled)')
      .eq('token', projectToken)
      .single()
    if (projectError || !project) return jsonResponse({ error: 'Invalid project' }, 403)

    const { data: item, error: itemError } = await supabase
      .from('checklist_items')
      .select('id, project_id, type, value')
      .eq('id', checklistItemId)
      .maybeSingle()
    if (itemError || !item || item.project_id !== project.id || item.type !== 'file') {
      return jsonResponse({ error: 'Item invalide' }, 403)
    }

    // Garde-fou projet : processing dont le DERNIER démarrage > 2 min → failed.
    await supabase
      .from('extracted_document_data')
      .update({
        status: 'failed',
        error_message: RATE_LIMIT_USER_MESSAGE,
      })
      .eq('project_id', project.id)
      .eq('status', 'processing')
      .lt(
        'processing_started_at',
        new Date(Date.now() - PROCESSING_STALE_MS).toISOString(),
      )

    // Résoudre la ligne à réutiliser + chemin (storage_path prioritaire sur item.value).
    let existing: { id: string; storage_path: string | null; status: string } | null = null
    if (requestedExtractionId) {
      const { data } = await supabase
        .from('extracted_document_data')
        .select('id, storage_path, status')
        .eq('id', requestedExtractionId)
        .eq('project_id', project.id)
        .eq('checklist_item_id', checklistItemId)
        .maybeSingle()
      existing = data
    }
    if (!existing) {
      const { data } = await supabase
        .from('extracted_document_data')
        .select('id, storage_path, status')
        .eq('project_id', project.id)
        .eq('checklist_item_id', checklistItemId)
        .in('status', ['processing', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existing = data
    }

    if (existing?.id) extractionId = existing.id

    const storagePath = (
      existing?.storage_path?.trim() ||
      (item.value ?? '').trim() ||
      ''
    )
    if (!storagePath || storagePath.startsWith('http')) {
      if (extractionId) {
        await finalizeFailed(extractionId, FILE_MISSING_USER_MESSAGE)
        terminal = true
      }
      return jsonResponse(
        { error: FILE_MISSING_USER_MESSAGE, code: 'file_missing', extractionId },
        400,
      )
    }

    const scopedOk = storagePath.startsWith(`${project.id}/${item.id}/`)
    const legacyOk = storagePath.startsWith(`${project.token}/`)
    if (!scopedOk && !legacyOk) {
      if (extractionId) {
        await finalizeFailed(extractionId, 'Chemin de fichier invalide')
        terminal = true
      }
      return jsonResponse({ error: 'Chemin de fichier invalide', extractionId }, 403)
    }
    if (legacyOk && project.token !== projectToken) {
      if (extractionId) {
        await finalizeFailed(extractionId, 'Chemin de fichier invalide')
        terminal = true
      }
      return jsonResponse({ error: 'Chemin de fichier invalide', extractionId }, 403)
    }

    const agencyRel = project.agencies as
      | { ai_extraction_enabled?: boolean }
      | { ai_extraction_enabled?: boolean }[]
      | null
    const agencyRow = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
    if (agencyRow?.ai_extraction_enabled !== true) {
      return jsonResponse({ skipped: true, reason: 'Module extraction désactivé' })
    }

    const addonDenied = await assertAiAddonActive(supabase, project.agency_id)
    if (addonDenied) {
      if (extractionId) {
        await finalizeFailed(extractionId, addonDenied.error)
        terminal = true
      }
      return jsonResponse({
        skipped: true,
        reason: addonDenied.error,
        code: addonDenied.code,
        extractionId,
      })
    }

    const extension = storagePath.split('.').pop()?.toLowerCase() ?? ''
    const mediaType = EXTENSION_MEDIA_TYPES[extension]
    if (!mediaType) {
      if (extractionId) {
        await finalizeFailed(extractionId, `Format non supporté (.${extension})`)
        terminal = true
      }
      return jsonResponse({
        skipped: true,
        reason: `Format non supporté (.${extension})`,
        extractionId,
      })
    }

    // Vérifier l'existence Storage AVANT processing (pas de crédit, pas de zombie).
    const { data: file, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath)
    if (downloadError || !file) {
      const missing = isStorageNotFound(downloadError) || !file
      const message = missing
        ? FILE_MISSING_USER_MESSAGE
        : (downloadError?.message ?? 'Téléchargement impossible')
      if (extractionId) {
        await finalizeFailed(extractionId, message)
        terminal = true
      } else {
        const { data: inserted } = await supabase
          .from('extracted_document_data')
          .insert({
            project_id: project.id,
            agency_id: project.agency_id,
            checklist_item_id: checklistItemId,
            storage_path: storagePath,
            status: 'failed',
            error_message: message,
          })
          .select('id')
          .single()
        extractionId = inserted?.id ?? null
        terminal = true
      }
      return jsonResponse(
        {
          error: message,
          code: missing ? 'file_missing' : 'download_failed',
          extractionId,
          status: 'failed',
        },
        400,
      )
    }

    // Entrées OK → passer (ou créer) en processing (+ processing_started_at = maintenant).
    const startedAt = new Date().toISOString()
    if (existing?.id) {
      extractionId = existing.id
      const { error: resetError } = await supabase
        .from('extracted_document_data')
        .update({
          status: 'processing',
          error_message: null,
          storage_path: storagePath,
          extracted_fields: null,
          field_confidence: null,
          reviewed_fields: null,
          processing_started_at: startedAt,
        })
        .eq('id', extractionId)
      if (resetError) throw new Error(resetError.message)
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('extracted_document_data')
        .insert({
          project_id: project.id,
          agency_id: project.agency_id,
          checklist_item_id: checklistItemId,
          storage_path: storagePath,
          status: 'processing',
          processing_started_at: startedAt,
        })
        .select('id')
        .single()
      if (insertError || !inserted) throw new Error(insertError?.message ?? 'Insert failed')
      extractionId = inserted.id
    }

    const deadlineAt = Date.now() + EXTRACTION_RETRY_BUDGET_MS
    const fileBuffer = await file.arrayBuffer()
    logMediaType = mediaType
    logFileBytes = fileBuffer.byteLength
    logStoragePath = storagePath
    const base64 = arrayBufferToBase64(fileBuffer)

    const ocrResult = await runOcr({
      mediaType,
      base64,
      annotationSchema: CLASSIFICATION_JSON_SCHEMA,
      annotationSchemaName: 'document_classification',
      deadlineAt,
    })

    await logAiUsage(supabase, {
      agencyId: project.agency_id,
      projectId: project.id,
      feature: 'extraction',
      operation: 'ocr',
      model: ocrResult.model,
      durationMs: ocrResult.durationMs,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      creditsConsumed: 0,
    })

    let documentType = 'unknown'
    if (ocrResult.documentAnnotation) {
      try {
        const classification = JSON.parse(ocrResult.documentAnnotation) as { document_type?: string }
        if (
          typeof classification.document_type === 'string' &&
          classification.document_type in DOCUMENT_SCHEMAS
        ) {
          documentType = classification.document_type
        }
      } catch {
        console.warn('Classification OCR non parsable')
      }
    }

    if (documentType === 'unknown') {
      await supabase
        .from('extracted_document_data')
        .update({
          document_type: 'unknown',
          status: 'failed',
          error_message: "Type de document non reconnu (attendu : pièce d'identité, Kbis ou RIB).",
          model_used: ocrResult.model,
          ocr_markdown: ocrResult.markdown || null,
          ocr_pages: ocrResult.pages.length > 0 ? ocrResult.pages : null,
        })
        .eq('id', extractionId)
        .eq('status', 'processing')
      terminal = true
      return jsonResponse({ extractionId, status: 'failed', documentType: 'unknown' })
    }

    let { fields, model, pipeline } = await extractFieldsFromOcr({
      documentType,
      ocrMarkdown: ocrResult.markdown,
      mediaType,
      base64,
      agencyId: project.agency_id,
      projectId: project.id,
      useVision: false,
      deadlineAt,
    })

    if (nullFieldRatio(fields) > 0.5 && Date.now() < deadlineAt) {
      const fallback = await extractFieldsFromOcr({
        documentType,
        ocrMarkdown: ocrResult.markdown,
        mediaType,
        base64,
        agencyId: project.agency_id,
        projectId: project.id,
        useVision: true,
        deadlineAt,
      })
      fields = fallback.fields
      model = fallback.model
      pipeline = fallback.pipeline
    }

    if (documentType === 'rib' && fields.iban) {
      const cleaned = fields.iban.replace(/\s+/g, '').toUpperCase()
      fields.iban = isValidIban(cleaned) ? cleaned : null
    }

    if (documentType === 'kbis') {
      if (fields.siren) {
        const cleaned = fields.siren.replace(/\s+/g, '')
        fields.siren = isValidSiren(cleaned) ? cleaned : null
      }
      if (fields.siret) {
        const cleaned = fields.siret.replace(/\s+/g, '')
        fields.siret = isValidSiret(cleaned) ? cleaned : null
      }
    }

    const fieldConfidence = heuristicFieldConfidence(fields)
    const hasAnyValue = Object.values(fields).some((value) => value !== null)

    if (!hasAnyValue) {
      await supabase
        .from('extracted_document_data')
        .update({
          document_type: documentType,
          extracted_fields: fields,
          field_confidence: fieldConfidence,
          prompt_version: EXTRACTION_PROMPT_VERSION,
          status: 'failed',
          model_used: model,
          extraction_pipeline: pipeline,
          ocr_markdown: ocrResult.markdown || null,
          ocr_pages: ocrResult.pages.length > 0 ? ocrResult.pages : null,
          error_message: 'Aucun champ exploitable extrait',
        })
        .eq('id', extractionId)
        .eq('status', 'processing')
      terminal = true
      return jsonResponse({ extractionId, status: 'failed', documentType })
    }

    // Si le garde-fou a déjà passé la ligne en failed pendant l'IA : pas de crédit, pas d'écrasement.
    const { data: currentRow } = await supabase
      .from('extracted_document_data')
      .select('status')
      .eq('id', extractionId)
      .maybeSingle()
    if (currentRow?.status !== 'processing') {
      terminal = true
      return jsonResponse({
        skipped: true,
        code: 'aborted_stale',
        reason: 'Extraction annulée (timeout / saturation). Relancez si besoin.',
        extractionId,
        status: currentRow?.status ?? 'failed',
      })
    }

    const credit = await consumeAiCredit(supabase, {
      agencyId: project.agency_id,
      feature: 'extraction',
      refId: extractionId,
    })
    if (!credit.ok) {
      await finalizeFailed(extractionId, credit.message)
      terminal = true
      return jsonResponse(
        { error: credit.message, code: credit.code, skipped: true, extractionId },
        credit.status,
      )
    }

    const { data: written, error: writeError } = await supabase
      .from('extracted_document_data')
      .update({
        document_type: documentType,
        extracted_fields: fields,
        field_confidence: fieldConfidence,
        prompt_version: EXTRACTION_PROMPT_VERSION,
        status: 'pending_review',
        model_used: model,
        extraction_pipeline: pipeline,
        ocr_markdown: ocrResult.markdown || null,
        ocr_pages: ocrResult.pages.length > 0 ? ocrResult.pages : null,
        error_message: null,
      })
      .eq('id', extractionId)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle()

    if (writeError) throw new Error(writeError.message)
    if (!written) {
      // Course : garde-fou entre le check et l'UPDATE — ne pas écraser le failed.
      terminal = true
      console.error(
        'extract-document-data: pending_review aborted after credit (status no longer processing)',
        extractionId,
      )
      return jsonResponse({
        skipped: true,
        code: 'aborted_stale',
        reason: 'Extraction annulée (timeout / saturation). Relancez si besoin.',
        extractionId,
      })
    }

    await logAiUsage(supabase, {
      agencyId: project.agency_id,
      projectId: project.id,
      feature: 'extraction',
      operation: 'chat',
      model,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      creditsConsumed: 1,
    })

    terminal = true
    return jsonResponse({ extractionId, status: 'pending_review', documentType })
  } catch (error) {
    const facing = toUserFacingAiError(error, {
      logContext: {
        provider: 'gemini',
        model: MODEL_VISION,
        extractionId,
        mediaType: logMediaType,
        fileBytes: logFileBytes,
        storagePath: logStoragePath?.slice(0, 120) ?? null,
      },
    })
    console.error('extract-document-data error:', {
      errorId: facing.errorId,
      kind: facing.kind,
      provider: 'gemini',
      model: MODEL_VISION,
      mediaType: logMediaType,
      fileBytes: logFileBytes,
      storagePath: logStoragePath?.slice(0, 120) ?? null,
      raw: (error as Error).message?.slice(0, 500),
    })
    if (extractionId) {
      await finalizeFailed(extractionId, facing.message)
      terminal = true
    }
    return jsonResponse(
      { error: facing.message, error_id: facing.errorId, kind: facing.kind, extractionId },
      facing.kind === 'rate_limit' ? 429 : 400,
    )
  } finally {
    if (extractionId && !terminal) {
      const errorId = newAiErrorId()
      await finalizeFailed(
        extractionId,
        `Une erreur est survenue lors de l'analyse du document. Réessayez ou contactez le support (réf. ${errorId}).`,
      )
    }
  }
})
