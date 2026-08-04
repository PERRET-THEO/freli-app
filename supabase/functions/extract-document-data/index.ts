/**
 * Extraction IA de données depuis un document uploadé par le client.
 *
 * Pipeline Mistral : OCR (classification + markdown) → chat json_schema
 * (mistral-small-latest) → fallback Pixtral si trop de champs null.
 * Résultat en pending_review : validation humaine obligatoire.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/functionAuth.ts'
import {
  arrayBufferToBase64,
  chatJsonSchema,
  logAiUsage,
  MODEL_PIXTRAL,
  MODEL_SMALL,
  normalizeToSchema,
  nullFieldRatio,
  runOcr,
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

type Body = {
  projectToken: string
  checklistItemId?: string
  storagePath: string
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

  const chatOptions = {
    model: options.useVision ? MODEL_PIXTRAL : MODEL_SMALL,
    system: EXTRACTION_SYSTEM,
    user: userPrompt,
    schema,
    schemaName: `extract_${options.documentType}`,
    maxTokens: 1500,
    temperature: 0,
    imageMediaType: options.useVision ? options.mediaType : undefined,
    imageBase64: options.useVision ? options.base64 : undefined,
  }

  const result = await chatJsonSchema<ExtractionPayload>(chatOptions)

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
    pipeline: options.useVision ? 'pixtral_fallback' : 'ocr_chat',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let extractionId: string | null = null

  try {
    const body = (await req.json()) as Body
    const projectToken = body.projectToken?.trim()
    const storagePath = body.storagePath?.trim()
    if (!projectToken || !storagePath) {
      return jsonResponse({ error: 'projectToken et storagePath requis' }, 400)
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, agency_id, token, agencies(ai_extraction_enabled)')
      .eq('token', projectToken)
      .single()
    if (projectError || !project) return jsonResponse({ error: 'Invalid project' }, 403)

    if (!storagePath.startsWith(`${projectToken}/`)) {
      return jsonResponse({ error: 'Chemin de fichier invalide' }, 403)
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
      return jsonResponse({
        skipped: true,
        reason: addonDenied.error,
        code: addonDenied.code,
      })
    }

    const credit = await consumeAiCredit(supabase, {
      agencyId: project.agency_id,
      feature: 'extraction',
    })
    if (!credit.ok) {
      return jsonResponse({
        skipped: true,
        reason: credit.message,
        code: credit.code,
      })
    }

    const extension = storagePath.split('.').pop()?.toLowerCase() ?? ''
    const mediaType = EXTENSION_MEDIA_TYPES[extension]
    if (!mediaType) {
      return jsonResponse({ skipped: true, reason: `Format non supporté (.${extension})` })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('extracted_document_data')
      .insert({
        project_id: project.id,
        agency_id: project.agency_id,
        checklist_item_id: body.checklistItemId ?? null,
        storage_path: storagePath,
        status: 'processing',
      })
      .select('id')
      .single()
    if (insertError || !inserted) throw new Error(insertError?.message ?? 'Insert failed')
    extractionId = inserted.id

    const { data: file, error: downloadError } = await supabase.storage
      .from('documents')
      .download(storagePath)
    if (downloadError || !file) throw new Error(downloadError?.message ?? 'Téléchargement impossible')

    const base64 = arrayBufferToBase64(await file.arrayBuffer())

    const ocrResult = await runOcr({
      mediaType,
      base64,
      annotationSchema: CLASSIFICATION_JSON_SCHEMA,
      annotationSchemaName: 'document_classification',
    })

    await logAiUsage(supabase, {
      agencyId: project.agency_id,
      projectId: project.id,
      feature: 'extraction',
      operation: 'ocr',
      model: ocrResult.model,
      durationMs: ocrResult.durationMs,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      creditsConsumed: 1,
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
    })

    if (nullFieldRatio(fields) > 0.5) {
      const fallback = await extractFieldsFromOcr({
        documentType,
        ocrMarkdown: ocrResult.markdown,
        mediaType,
        base64,
        agencyId: project.agency_id,
        projectId: project.id,
        useVision: true,
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
    const status = hasAnyValue ? 'pending_review' : 'failed'

    await supabase
      .from('extracted_document_data')
      .update({
        document_type: documentType,
        extracted_fields: fields,
        field_confidence: fieldConfidence,
        prompt_version: EXTRACTION_PROMPT_VERSION,
        status,
        model_used: model,
        extraction_pipeline: pipeline,
        ocr_markdown: ocrResult.markdown || null,
        ocr_pages: ocrResult.pages.length > 0 ? ocrResult.pages : null,
        error_message: hasAnyValue ? null : 'Aucun champ exploitable extrait',
      })
      .eq('id', extractionId)

    return jsonResponse({ extractionId, status, documentType })
  } catch (error) {
    const message = (error as Error).message
    console.error('extract-document-data error:', message)
    if (extractionId) {
      await supabase
        .from('extracted_document_data')
        .update({ status: 'failed', error_message: message })
        .eq('id', extractionId)
    }
    return jsonResponse({ error: message }, 400)
  }
})
