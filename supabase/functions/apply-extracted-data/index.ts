/**
 * Validation humaine des données extraites par l'IA.
 *
 * Appelée depuis le dashboard agence (JWT requis). C'est la SEULE porte
 * d'entrée vers les données officielles : l'extraction IA reste en
 * `pending_review` tant que l'agence n'a pas validé ici. Chaque correction
 * manuelle est journalisée dans extraction_audit_logs pour mesurer la
 * fiabilité de l'extraction dans le temps.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, getAuthenticatedUser, assertUserIsAgencyMember, jsonResponse } from '../_shared/functionAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

type Body = {
  extractionId: string
  action: 'validate' | 'reject'
  reviewedFields?: Record<string, string | null>
}

/** Correspondance champs extraits → colonnes de la fiche client. */
const CLIENT_FIELD_MAP: Record<string, Record<string, string>> = {
  identity: {
    first_name: 'first_name',
    last_name: 'last_name',
    address: 'address_street',
  },
  kbis: {
    company_name: 'company_name',
    legal_form: 'company_type',
    siret: 'siret',
    registered_address: 'address_street',
  },
  rib: {
    iban: 'iban',
    bic: 'bic',
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = (await req.json()) as Body
    if (!body.extractionId || !['validate', 'reject'].includes(body.action)) {
      return jsonResponse({ error: 'extractionId et action (validate|reject) requis' }, 400)
    }

    const { data: extraction, error: extractionError } = await supabase
      .from('extracted_document_data')
      .select('id, project_id, agency_id, document_type, extracted_fields, status')
      .eq('id', body.extractionId)
      .single()
    if (extractionError || !extraction) return jsonResponse({ error: 'Extraction introuvable' }, 404)

    const memberDenied = await assertUserIsAgencyMember(supabase, user.id, extraction.agency_id)
    if (memberDenied) return jsonResponse({ error: memberDenied.error }, memberDenied.status)

    if (extraction.status !== 'pending_review') {
      return jsonResponse({ error: `Extraction déjà traitée (statut : ${extraction.status})` }, 409)
    }

    const now = new Date().toISOString()

    if (body.action === 'reject') {
      await supabase
        .from('extracted_document_data')
        .update({ status: 'rejected', reviewed_at: now, reviewed_by: user.id })
        .eq('id', extraction.id)
      await supabase.from('extraction_audit_logs').insert({
        extraction_id: extraction.id,
        action: 'rejected',
        performed_by: user.id,
      })
      return jsonResponse({ status: 'rejected' })
    }

    // Validation : les valeurs revues par l'agence font foi
    const aiFields = (extraction.extracted_fields ?? {}) as Record<string, string | null>
    const reviewedFields: Record<string, string | null> = {}
    for (const field of Object.keys(aiFields)) {
      const provided = body.reviewedFields?.[field]
      reviewedFields[field] =
        typeof provided === 'string' && provided.trim() ? provided.trim() : provided === null ? null : aiFields[field]
    }

    // Journal des corrections manuelles (mesure de fiabilité de l'IA)
    type AuditRow = {
      extraction_id: string
      action: 'validated' | 'field_corrected'
      field_name?: string
      ai_value?: string | null
      corrected_value?: string | null
      performed_by: string
    }
    const auditRows: AuditRow[] = Object.keys(reviewedFields)
      .filter((field) => reviewedFields[field] !== aiFields[field])
      .map((field) => ({
        extraction_id: extraction.id,
        action: 'field_corrected' as const,
        field_name: field,
        ai_value: aiFields[field],
        corrected_value: reviewedFields[field],
        performed_by: user.id,
      }))
    auditRows.push({ extraction_id: extraction.id, action: 'validated', performed_by: user.id })

    // Pré-remplissage de la fiche client liée au projet (si elle existe)
    let appliedToClient = false
    const fieldMap = CLIENT_FIELD_MAP[extraction.document_type] ?? {}
    const { data: project } = await supabase
      .from('projects')
      .select('client_id')
      .eq('id', extraction.project_id)
      .single()

    if (project?.client_id) {
      const clientUpdate: Record<string, string> = {}
      for (const [sourceField, clientColumn] of Object.entries(fieldMap)) {
        const value = reviewedFields[sourceField]
        if (value) clientUpdate[clientColumn] = value
      }
      if (Object.keys(clientUpdate).length > 0) {
        const { error: clientError } = await supabase
          .from('clients')
          .update({ ...clientUpdate, updated_at: now })
          .eq('id', project.client_id)
        if (clientError) throw new Error(`Mise à jour client impossible : ${clientError.message}`)
        appliedToClient = true
      }
    }

    const { error: updateError } = await supabase
      .from('extracted_document_data')
      .update({
        status: 'validated',
        reviewed_fields: reviewedFields,
        reviewed_at: now,
        reviewed_by: user.id,
      })
      .eq('id', extraction.id)
    if (updateError) throw new Error(updateError.message)

    const { error: auditError } = await supabase.from('extraction_audit_logs').insert(auditRows)
    if (auditError) console.error('extraction audit insert failed:', auditError.message)

    return jsonResponse({ status: 'validated', appliedToClient })
  } catch (error) {
    console.error('apply-extracted-data error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
