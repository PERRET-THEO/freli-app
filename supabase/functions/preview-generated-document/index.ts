/**
 * Aperçu HTML d'un document généré avant finalisation PDF.
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
import { corsHeaders, getAuthenticatedUser, assertUserIsAgencyMember, jsonResponse } from '../_shared/functionAuth.ts'
import { previewContractHtml } from '../_shared/pdfService.ts'

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

    const body = (await req.json()) as {
      documentId?: string
      version?: DocumentVersion
    }
    if (!body.documentId) return jsonResponse({ error: 'documentId requis' }, 400)

    const { data: document, error: documentError } = await supabase
      .from('generated_documents')
      .select(
        `id, agency_id, current_version, status,
        agencies(
          name, logo_url, brand_color, contact_email, contact_phone,
          legal_form, address_street, address_postal_code, address_city,
          siret, share_capital, vat_number, rcs_city
        ),
        projects(
          client_name, client_email,
          clients(company_name, first_name, last_name, email, address_street, address_city, address_postal_code, siret)
        )`,
      )
      .eq('id', body.documentId)
      .single()
    if (documentError || !document) return jsonResponse({ error: 'Document introuvable' }, 404)

    const memberDenied = await assertUserIsAgencyMember(supabase, user.id, document.agency_id)
    if (memberDenied) return jsonResponse({ error: memberDenied.error }, memberDenied.status)

    const agencyRel = document.agencies as AgencyRow | AgencyRow[] | null
    const agencyRow = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel

    const version = (body.version ?? document.current_version) as DocumentVersion
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

    const html = previewContractHtml(version, agencyProfile, clientProfile, layoutProfile)

    return jsonResponse({ html })
  } catch (error) {
    console.error('preview-generated-document error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
