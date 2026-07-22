/**
 * Analyse d'un modèle de référence (contrat/proposition uploadé par l'agence).
 *
 * Pipeline Mistral : OCR du PDF (blocs + structure) → mistral-large-latest extrait
 * un résumé structuré stocké dans structure_summary + layout_profile.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildLayoutProfileFromSummary } from '../_shared/contractDocument.ts'
import { corsHeaders, getAuthenticatedUser, jsonResponse } from '../_shared/functionAuth.ts'
import {
  arrayBufferToBase64,
  chatJsonSchema,
  logAiUsage,
  MODEL_LARGE,
  runOcr,
} from '../_shared/ai-provider.ts'
import { STRUCTURE_SUMMARY_JSON_SCHEMA } from '../_shared/documentSchemas.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

const SYSTEM_PROMPT = `Tu analyses un document contractuel (contrat ou proposition commerciale) fourni par une agence française pour en extraire la structure, le style et les indices de mise en page.

Règles :
- Reste strictement fidèle au document : ne complète pas, n'invente rien.
- "recurring_clauses" : uniquement les clauses juridiques types réellement présentes (confidentialité, résiliation, paiement, propriété intellectuelle…).
- "layout_hints" : décris le style visuel observé (titres en majuscules, sections numérotées, espacement compact, présence de tableaux).
- "typography" : estime la densité et le style des titres à partir du document.
- "header_footer_style" : reprends le contenu d'en-tête/pied de page si fourni dans le contexte OCR.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { modelId } = (await req.json()) as { modelId?: string }
    if (!modelId) return jsonResponse({ error: 'modelId requis' }, 400)

    const { data: model, error: modelError } = await supabase
      .from('agency_document_models')
      .select('id, agency_id, storage_path, agencies(user_id, ai_contracts_enabled)')
      .eq('id', modelId)
      .single()
    if (modelError || !model) return jsonResponse({ error: 'Modèle introuvable' }, 404)

    const agencyRel = model.agencies as
      | { user_id?: string; ai_contracts_enabled?: boolean }
      | { user_id?: string; ai_contracts_enabled?: boolean }[]
      | null
    const agency = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
    if (agency?.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403)
    if (agency?.ai_contracts_enabled !== true) {
      return jsonResponse({ error: 'Module génération de contrats désactivé' }, 403)
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from('contracts')
      .download(model.storage_path)
    if (downloadError || !file) {
      throw new Error(downloadError?.message ?? 'Téléchargement du modèle impossible')
    }

    const base64 = arrayBufferToBase64(await file.arrayBuffer())

    const ocrResult = await runOcr({
      mediaType: 'application/pdf',
      base64,
      includeBlocks: true,
      tableFormat: 'html',
      extractHeader: true,
      extractFooter: true,
    })

    await logAiUsage(supabase, {
      agencyId: model.agency_id,
      feature: 'contracts',
      operation: 'ocr',
      model: ocrResult.model,
      durationMs: ocrResult.durationMs,
    })

    const ocrHeaders = ocrResult.pages.map((p) => p.header).filter(Boolean).join('\n')
    const ocrFooters = ocrResult.pages.map((p) => p.footer).filter(Boolean).join('\n')
    const blockTypes = ocrResult.pages
      .flatMap((p) => (p.blocks as Array<{ type?: string }> | undefined) ?? [])
      .map((b) => b.type)
      .filter(Boolean)
    const blockSummary = [...new Set(blockTypes)].join(', ') || 'non détectés'

    const userPrompt = [
      'Analyse ce document contractuel à partir du texte OCR ci-dessous.',
      ocrHeaders ? `En-têtes OCR extraits :\n${ocrHeaders}` : null,
      ocrFooters ? `Pieds de page OCR extraits :\n${ocrFooters}` : null,
      `Types de blocs détectés : ${blockSummary}`,
      'Texte OCR :',
      ocrResult.markdown || '(texte vide — base-toi sur la structure minimale)',
    ].filter(Boolean).join('\n\n')

    const result = await chatJsonSchema<Record<string, unknown>>({
      model: MODEL_LARGE,
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: STRUCTURE_SUMMARY_JSON_SCHEMA,
      schemaName: 'structure_summary',
      maxTokens: 3000,
      temperature: 0,
    })

    await logAiUsage(supabase, {
      agencyId: model.agency_id,
      feature: 'contracts',
      operation: 'chat',
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
    })

    const summary = result.parsed
    const layoutProfile = buildLayoutProfileFromSummary(summary)

    const { error: updateError } = await supabase
      .from('agency_document_models')
      .update({
        structure_summary: summary,
        layout_profile: layoutProfile,
      })
      .eq('id', model.id)
    if (updateError) throw new Error(updateError.message)

    return jsonResponse({ success: true, structureSummary: summary, layoutProfile })
  } catch (error) {
    console.error('analyze-contract-model error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
