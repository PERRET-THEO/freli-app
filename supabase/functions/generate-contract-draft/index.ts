/**
 * Génération d'une première version de contrat/proposition depuis un brief.
 *
 * Mistral large-latest avec json_schema strict. Traçabilité ai_version vs
 * current_version. Jamais d'envoi automatique au client.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import { chatJsonSchema, logAiUsage, MODEL_LARGE } from '../_shared/ai-provider.ts'
import { agencyLegalContextBlock, type AgencyLegalProfile } from '../_shared/agencyLegal.ts'
import { CONTRACT_DRAFT_JSON_SCHEMA } from '../_shared/documentSchemas.ts'
import { assertAiAddonActive, consumeAiCredit } from '../_shared/aiEntitlements.ts'
import {
  CONTRACT_PROMPT_VERSION,
  parseContractDraft,
} from '../_shared/aiValidation.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey)

type Section = {
  id: string
  heading: string
  content: string
  origin: 'brief' | 'model' | 'ai_generated' | 'library'
  needs_legal_review: boolean
}

const SYSTEM_PROMPT = `Tu rédiges la première version d'un contrat ou d'une proposition commerciale en français, pour le compte d'une agence, à partir d'un brief en langage naturel.

Règles impératives :
- Structure attendue dans cet ordre (adapte selon le brief et les modèles) :
  1. Objet de la prestation
  2. Durée / délais
  3. Tarif et conditions financières
  4. Modalités de paiement
  5. Clauses juridiques (confidentialité, propriété intellectuelle, résiliation, etc.)
- Chaque section a un titre clair et un contenu structuré en paragraphes.
- "origin" indique la provenance du contenu : "brief" (information donnée par l'agence dans le brief ou les données projet), "model" (clause reprise d'un modèle de référence fourni), "library" (clause issue de la bibliothèque de clauses validées de l'agence), "ai_generated" (contenu que tu as rédigé sans source).
- Préfère TOUJOURS les clauses de la bibliothèque ("library") lorsqu'elles sont fournies, sans les réécrire sauf adaptation mineure de forme.
- Toute clause JURIDIQUE dont le contenu ne provient ni du brief, ni d'un modèle, ni de la bibliothèque DOIT avoir "origin": "ai_generated" et "needs_legal_review": true. Ne présente jamais une clause inventée comme sûre.
- Reprends le ton et la structure des modèles de référence quand ils sont fournis.
- N'invente aucune donnée chiffrée (montant, durée, date) absente du brief ou des données projet : écris plutôt "[à compléter]" uniquement si la donnée n'est pas fournie.
- Texte brut dans "content" (pas de markdown), paragraphes séparés par une ligne vide.
- Utilise des tirets "-" en début de ligne pour les listes à puces, une puce par ligne.
- Utilise la numérotation "1." "2." pour les listes numérotées, un élément par ligne.
- Pour les blocs DE (prestataire) et POUR (client), mets chaque information sur une ligne séparée.
- Si le profil légal du prestataire est fourni, recopie ces valeurs sans placeholder.`


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { projectId, brief, checklistContext } = (await req.json()) as {
      projectId?: string
      brief?: string
      checklistContext?: string[]
    }
    if (!projectId || !brief?.trim()) {
      return jsonResponse({ error: 'projectId et brief requis' }, 400)
    }

    const denied = await assertUserOwnsProject(supabase, user.id, projectId)
    if (denied) return jsonResponse({ error: denied.error }, denied.status)

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, agency_id, client_name, client_email, price, created_at, agencies(name, ai_contracts_enabled, legal_form, address_street, address_postal_code, address_city, siret, share_capital, vat_number, rcs_city, contact_email, contact_phone), clients(company_name, first_name, last_name, address_street, address_city, address_postal_code, siret)',
      )
      .eq('id', projectId)
      .single()
    if (projectError || !project) return jsonResponse({ error: 'Projet introuvable' }, 404)

    const agencyRel = project.agencies as
      | (AgencyLegalProfile & { name?: string; ai_contracts_enabled?: boolean })
      | (AgencyLegalProfile & { name?: string; ai_contracts_enabled?: boolean })[]
      | null
    const agency = Array.isArray(agencyRel) ? agencyRel[0] : agencyRel
    if (agency?.ai_contracts_enabled !== true) {
      return jsonResponse({ error: 'Module génération de contrats désactivé' }, 403)
    }

    const addonDenied = await assertAiAddonActive(supabase, project.agency_id)
    if (addonDenied) {
      return jsonResponse({ error: addonDenied.error, code: addonDenied.code }, addonDenied.status)
    }

    const credit = await consumeAiCredit(supabase, {
      agencyId: project.agency_id,
      feature: 'contracts',
    })
    if (!credit.ok) {
      return jsonResponse({ error: credit.message, code: credit.code }, credit.status)
    }

    const agencyProfile: AgencyLegalProfile = {
      name: agency?.name?.trim() || 'Agence',
      legal_form: agency?.legal_form ?? null,
      address_street: agency?.address_street ?? null,
      address_postal_code: agency?.address_postal_code ?? null,
      address_city: agency?.address_city ?? null,
      siret: agency?.siret ?? null,
      share_capital: agency?.share_capital ?? null,
      vat_number: agency?.vat_number ?? null,
      rcs_city: agency?.rcs_city ?? null,
      contact_email: agency?.contact_email ?? null,
      contact_phone: agency?.contact_phone ?? null,
    }

    const { data: models } = await supabase
      .from('agency_document_models')
      .select('name, structure_summary')
      .eq('agency_id', project.agency_id)
      .not('structure_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3)

    const { data: libraryClauses } = await supabase
      .from('ai_clause_library')
      .select('title, content, category')
      .eq('agency_id', project.agency_id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(20)

    const clientRel = project.clients as Record<string, unknown> | Record<string, unknown>[] | null
    const client = (Array.isArray(clientRel) ? clientRel[0] : clientRel) ?? null

    const projectContext: string[] = [
      `Nom de l'agence (prestataire) : ${agency?.name ?? 'Non renseigné'}`,
      `Nom du client : ${project.client_name}`,
      `Email du client : ${project.client_email}`,
    ]
    if (project.price != null) projectContext.push(`Montant défini dans Freli : ${project.price} €`)
    if (client) {
      if (client.company_name) projectContext.push(`Société du client : ${client.company_name}`)
      if (client.siret) projectContext.push(`SIRET du client : ${client.siret}`)
      const address = [client.address_street, client.address_postal_code, client.address_city]
        .filter(Boolean)
        .join(', ')
      if (address) projectContext.push(`Adresse du client : ${address}`)
    }
    projectContext.push(
      `Date du jour : ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    )

    const modelsBlock =
      models && models.length > 0
        ? models
            .map(
              (m, i) =>
                `Modèle de référence ${i + 1} (« ${m.name} ») :\n${JSON.stringify(m.structure_summary)}`,
            )
            .join('\n\n')
        : 'Aucun modèle de référence fourni.'

    const libraryBlock =
      libraryClauses && libraryClauses.length > 0
        ? libraryClauses
            .map(
              (c, i) =>
                `Clause bibliothèque ${i + 1} [${c.category}] « ${c.title} » :\n${c.content}`,
            )
            .join('\n\n')
        : 'Aucune clause en bibliothèque : les clauses juridiques inventées doivent être ai_generated + needs_legal_review.'

    const checklistBlock =
      Array.isArray(checklistContext) && checklistContext.length > 0
        ? `ÉLÉMENTS DE LA CHECKLIST ONBOARDING (à refléter dans le contrat si pertinent) :\n${checklistContext.join('\n')}`
        : null

    const userMessage = [
      `BRIEF DE L'AGENCE :\n${brief.trim()}`,
      checklistBlock,
      `DONNÉES PROJET CONNUES :\n${projectContext.join('\n')}`,
      agencyLegalContextBlock(agencyProfile),
      `MODÈLES DE RÉFÉRENCE DE L'AGENCE :\n${modelsBlock}`,
      `BIBLIOTHÈQUE DE CLAUSES VALIDÉES :\n${libraryBlock}`,
    ]
      .filter(Boolean)
      .join('\n\n---\n\n')

    const result = await chatJsonSchema<{
      title?: string
      sections?: Array<Partial<Section>>
    }>({
      model: MODEL_LARGE,
      system: SYSTEM_PROMPT,
      user: userMessage,
      schema: CONTRACT_DRAFT_JSON_SCHEMA,
      schemaName: 'contract_draft',
      maxTokens: 6000,
      temperature: 0.3,
    })

    await logAiUsage(supabase, {
      agencyId: project.agency_id,
      projectId: project.id,
      feature: 'contracts',
      operation: 'chat',
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      promptVersion: CONTRACT_PROMPT_VERSION,
      creditsConsumed: 1,
    })

    const validated = parseContractDraft(result.parsed)
    if (!validated.ok) {
      throw new Error(`Réponse IA invalide : ${validated.error}`)
    }

    const sections: Section[] = validated.sections.map((section) => ({
      ...section,
      id: crypto.randomUUID(),
      needs_legal_review:
        section.needs_legal_review ||
        section.origin === 'ai_generated',
    }))

    const version = { title: validated.title, sections }

    const { data: document, error: insertError } = await supabase
      .from('generated_documents')
      .insert({
        project_id: project.id,
        agency_id: project.agency_id,
        brief: brief.trim(),
        ai_version: version,
        current_version: version,
        status: 'draft',
        model_used: result.model,
      })
      .select('id')
      .single()
    if (insertError || !document) throw new Error(insertError?.message ?? 'Insert failed')

    return jsonResponse({ documentId: document.id, version })
  } catch (error) {
    console.error('generate-contract-draft error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
