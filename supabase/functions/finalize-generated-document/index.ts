/**
 * Finalisation d'un document généré : rendu PDF stylé + entrée contract_templates.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildAgencyProfile,
  buildClientProfile,
  resolveLayoutProfile,
  type AgencyRow,
  type ProjectRow,
} from '../_shared/contractProfiles.ts'
import type { LayoutProfile } from '../_shared/contractDocument.ts'
import {
  HTML_SIGNATURE_HEIGHT,
  HTML_SIGNATURE_WIDTH,
  HTML_SIGNATURE_X,
  HTML_SIGNATURE_Y,
} from '../_shared/contractDocument.ts'
import { corsHeaders, getAuthenticatedUser, jsonResponse } from '../_shared/functionAuth.ts'
import { renderContractToPdf } from '../_shared/pdfService.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

type DocumentVersion = {
  title: string
  sections: Array<{ heading: string; content: string }>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { documentId } = (await req.json()) as { documentId?: string }
    if (!documentId) return jsonResponse({ error: 'documentId requis' }, 400)

    const { data: document, error: documentError } = await supabase
      .from('generated_documents')
      .select(
        `id, project_id, agency_id, current_version, status,
        agencies(
          user_id, name, logo_url, brand_color, contact_email, contact_phone,
          legal_form, address_street, address_postal_code, address_city,
          siret, share_capital, vat_number, rcs_city
        ),
        projects(
          client_name, client_email,
          clients(company_name, first_name, last_name, email, address_street, address_city, address_postal_code, siret)
        )`,
      )
      .eq('id', documentId)
      .single()
    if (documentError || !document) return jsonResponse({ error: 'Document introuvable' }, 404)

    const agencyRel = document.agencies as AgencyRow | AgencyRow[] | null
    const agencyRow = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
    if (agencyRow?.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403)

    if (document.status === 'finalized') {
      return jsonResponse({ error: 'Document déjà finalisé' }, 409)
    }

    const version = document.current_version as DocumentVersion
    if (!version?.title || !Array.isArray(version.sections)) {
      return jsonResponse({ error: 'Version du document invalide' }, 400)
    }

    const agencyProfile = buildAgencyProfile(agencyRow)
    const projectRel = document.projects as ProjectRow | ProjectRow[] | null
    const projectRow = Array.isArray(projectRel) ? projectRel[0] : projectRel
    const clientProfile = buildClientProfile(projectRow ?? null)

    const { data: referenceModel } = await supabase
      .from('agency_document_models')
      .select('layout_profile, structure_summary')
      .eq('agency_id', document.agency_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const layoutProfile = resolveLayoutProfile(
      referenceModel?.layout_profile as LayoutProfile | null,
      referenceModel?.structure_summary as Record<string, unknown> | null,
    )

    const { bytes: pdfBytes, renderer } = await renderContractToPdf(
      version,
      agencyProfile,
      clientProfile,
      layoutProfile,
    )

    const filePath = `generated/${document.agency_id}/${Date.now()}_contrat_genere.pdf`
    const { error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: false })
    if (uploadError) throw new Error(`Upload PDF échoué : ${uploadError.message}`)

    const { data: template, error: templateError } = await supabase
      .from('contract_templates')
      .insert({
        agency_id: document.agency_id,
        name: version.title.slice(0, 120),
        pdf_url: filePath,
        is_default: false,
        signature_page: -1,
        signature_x: HTML_SIGNATURE_X,
        signature_y: HTML_SIGNATURE_Y,
        signature_width: HTML_SIGNATURE_WIDTH,
        signature_height: HTML_SIGNATURE_HEIGHT,
      })
      .select('id')
      .single()
    if (templateError || !template) {
      throw new Error(templateError?.message ?? 'Création du template impossible')
    }

    const { error: updateError } = await supabase
      .from('generated_documents')
      .update({
        status: 'finalized',
        contract_template_id: template.id,
        finalized_at: new Date().toISOString(),
      })
      .eq('id', document.id)
    if (updateError) throw new Error(updateError.message)

    return jsonResponse({
      success: true,
      contractTemplateId: template.id,
      storagePath: filePath,
      renderer,
    })
  } catch (error) {
    console.error('finalize-generated-document error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
