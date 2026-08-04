/**
 * Génération du CONTENU d'une relance intelligente par Mistral.
 *
 * La décision d'envoyer (timing, plafond, catégorie) est déterministe
 * (smart-reminders-batch). Ici : rédaction via mistral-small-latest.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk, isDevMode } from '../_shared/email.ts'
import { buildSmartReminderEmail } from '../_shared/clientEmailHtml.ts'
import {
  assertUserOwnsProject,
  corsHeaders,
  getAuthenticatedUser,
  isInternalRequest,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import { chatJsonSchema, logAiUsage, MODEL_SMALL } from '../_shared/ai-provider.ts'
import { getPendingVisibleItems } from '../_shared/checklistVisibility.ts'
import { REMINDER_JSON_SCHEMA } from '../_shared/documentSchemas.ts'
import { assertAiAddonActive, consumeAiCredit } from '../_shared/aiEntitlements.ts'
import { parseReminderPayload, REMINDER_PROMPT_VERSION } from '../_shared/aiValidation.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

type BehaviorCategory = 'not_opened' | 'opened_not_clicked' | 'stuck_on_step'

type Body = {
  projectId: string
  behaviorCategory: BehaviorCategory
  blockingStepLabel?: string
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'Ton professionnel et courtois. Vouvoiement. Phrases sobres, sans emoji.',
  warm: 'Ton chaleureux et bienveillant. Vouvoiement. Tu peux utiliser une touche de convivialité, sans excès.',
  direct: 'Ton direct et concis. Vouvoiement. Va droit au but, phrases courtes.',
}

const BEHAVIOR_INSTRUCTIONS: Record<BehaviorCategory, string> = {
  not_opened:
    "Le client n'a pas ouvert les emails précédents (signal Resend). Rédige un OBJET très différent des objets habituels de rappel (pas de mot « rappel »), qui attire l'attention. Le corps doit être court et direct.",
  opened_not_clicked:
    "Le client a ouvert les emails mais n'a pas cliqué vers son espace d'onboarding (ou ne l'a pas visité). Mets en avant un bénéfice concret (gain de temps, projet qui démarre plus vite) et rassure (« cela ne prend que quelques minutes », lien direct, aucune création de compte).",
  stuck_on_step:
    "Le client a commencé son parcours mais est bloqué sur une étape précise. Cible UNIQUEMENT cette étape : dis-lui explicitement qu'il ne lui reste que cette action et rassure sur sa simplicité.",
}

const SYSTEM_PROMPT = `Tu rédiges des emails de relance d'onboarding pour le compte d'agences et de freelances.

Règles impératives :
- "subject" : objet d'email en français, 60 caractères maximum.
- "body" : corps en français, 60 à 120 mots, texte brut (pas de HTML, pas de markdown). Sépare les paragraphes par une ligne vide. Ne mets PAS de formule d'appel à l'action avec lien : le bouton est ajouté automatiquement sous ton texte. Termine par une formule de politesse simple signée du nom de l'agence.
- INTERDICTION ABSOLUE de promettre quoi que ce soit d'ordre commercial ou financier : aucune remise, aucun geste commercial, aucun délai contractuel, aucun engagement au nom de l'agence.
- N'invente aucune information sur le projet : utilise uniquement les éléments fournis.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as Body
    if (!body.projectId || !body.behaviorCategory) {
      return jsonResponse({ error: 'projectId et behaviorCategory requis' }, 400)
    }
    if (!(body.behaviorCategory in BEHAVIOR_INSTRUCTIONS)) {
      return jsonResponse({ error: 'behaviorCategory invalide' }, 400)
    }

    if (!isInternalRequest(req)) {
      const user = await getAuthenticatedUser(req)
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
      const denied = await assertUserOwnsProject(supabase, user.id, body.projectId)
      if (denied) return jsonResponse({ error: denied.error }, denied.status)
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, token, client_name, client_email, agency_id, agencies(name, ai_reminders_enabled, ai_reminder_tone, ai_reminder_auto_send)',
      )
      .eq('id', body.projectId)
      .single()
    if (projectError || !project) return jsonResponse({ error: 'Projet introuvable' }, 404)

    const agencyRel = project.agencies as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | null
    const agency = (Array.isArray(agencyRel) ? agencyRel[0] : agencyRel) ?? {}
    if (agency.ai_reminders_enabled !== true) {
      return jsonResponse({ skipped: true, reason: 'Module relances IA désactivé' })
    }

    const addonDenied = await assertAiAddonActive(supabase, project.agency_id)
    if (addonDenied) {
      return jsonResponse({ skipped: true, reason: addonDenied.error, code: addonDenied.code })
    }

    const credit = await consumeAiCredit(supabase, {
      agencyId: project.agency_id,
      feature: 'reminders',
    })
    if (!credit.ok) {
      return jsonResponse({ skipped: true, reason: credit.message, code: credit.code })
    }

    const agencyName = typeof agency.name === 'string' && agency.name ? agency.name : 'Votre agence'
    const tone =
      typeof agency.ai_reminder_tone === 'string' && agency.ai_reminder_tone in TONE_INSTRUCTIONS
        ? agency.ai_reminder_tone
        : 'professional'
    const autoSend = agency.ai_reminder_auto_send === true

    const firstName = project.client_name.trim().split(/\s+/)[0] ?? project.client_name

    const contextLines = [
      `Prénom du client : ${firstName}`,
      `Nom de l'agence : ${agencyName}`,
      `Comportement détecté : ${BEHAVIOR_INSTRUCTIONS[body.behaviorCategory]}`,
      `Ton de marque : ${TONE_INSTRUCTIONS[tone]}`,
    ]
    if (body.behaviorCategory === 'stuck_on_step' && body.blockingStepLabel) {
      contextLines.push(`Étape bloquante : « ${body.blockingStepLabel} »`)
    }

    // Nommer les étapes manquantes évite les relances vagues « il reste des
    // choses ». La liste complète sert à écarter les étapes conditionnelles
    // non déclenchées, qu'on ne doit pas réclamer.
    const { data: allRows } = await supabase
      .from('checklist_items')
      .select('label, completed, value, review_note, review_status, config')
      .eq('project_id', project.id)
      .order('order_index', { ascending: true })

    const pendingItems = getPendingVisibleItems(allRows ?? [])
    if (pendingItems.length > 0) {
      contextLines.push(
        `Étapes encore attendues : ${pendingItems.map((row) => `« ${row.label} »`).join(', ')}`,
      )
    }

    const corrections = pendingItems.filter(
      (row) => row.review_status === 'rejected' && String(row.review_note ?? '').trim(),
    )
    if (corrections.length > 0) {
      contextLines.push(
        `Corrections demandées par l'agence : ${corrections
          .map((row) => `« ${row.label} » — ${row.review_note}`)
          .join(' ; ')}`,
        "Mentionne explicitement les corrections attendues, sans reprocher quoi que ce soit au client.",
      )
    }

    const result = await chatJsonSchema<{ subject?: string; body?: string }>({
      model: MODEL_SMALL,
      system: SYSTEM_PROMPT,
      user: contextLines.join('\n'),
      schema: REMINDER_JSON_SCHEMA,
      schemaName: 'smart_reminder',
      maxTokens: 600,
      temperature: 0.7,
    })

    await logAiUsage(supabase, {
      agencyId: project.agency_id,
      projectId: project.id,
      feature: 'reminders',
      operation: 'chat',
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      promptVersion: REMINDER_PROMPT_VERSION,
      creditsConsumed: 1,
    })

    const parsed = parseReminderPayload(result.parsed)
    if (!parsed.ok) {
      throw new Error(`Réponse IA invalide: ${parsed.error}`)
    }
    const subject = parsed.subject
    const bodyText = parsed.body

    // Première relance du projet : toujours brouillon (preview humain obligatoire).
    const { count: priorSent } = await supabase
      .from('smart_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'sent')
    const requirePreview = (priorSent ?? 0) === 0
    const willAutoSend = autoSend && !requirePreview

    const { data: reminder, error: insertError } = await supabase
      .from('smart_reminders')
      .insert({
        project_id: project.id,
        agency_id: project.agency_id,
        behavior_category: body.behaviorCategory,
        blocking_step_label: body.blockingStepLabel ?? null,
        subject,
        body: bodyText,
        tone,
        status: 'draft',
        model_used: result.model,
      })
      .select('id')
      .single()
    if (insertError || !reminder) throw new Error(insertError?.message ?? 'Insert failed')

    if (!willAutoSend) {
      return jsonResponse({
        reminderId: reminder.id,
        status: 'draft',
        previewRequired: requirePreview,
      })
    }

    const portalUrl = `${appUrl}/p/${project.token}`
    if (isDevMode()) {
      console.log('MODE DEV — Relance IA simulée pour:', project.client_email, subject)
      await supabase
        .from('smart_reminders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', reminder.id)
      return jsonResponse({ reminderId: reminder.id, status: 'sent', simulated: true })
    }

    const sendResult = await resend.emails.send({
      from: getResendFrom(),
      to: project.client_email,
      subject,
      html: buildSmartReminderEmail({ bodyText, agencyName, portalUrl }),
    })
    assertResendOk(sendResult)
    const resendEmailId = (sendResult.data as { id?: string } | null)?.id ?? null

    const now = new Date().toISOString()
    await supabase
      .from('smart_reminders')
      .update({ status: 'sent', sent_at: now, resend_email_id: resendEmailId })
      .eq('id', reminder.id)
    await supabase
      .from('projects')
      .update({ last_reminder_sent_at: now })
      .eq('id', project.id)
    await supabase.from('project_reminder_logs').insert({
      project_id: project.id,
      agency_id: project.agency_id,
      source: 'auto',
      recipient_email: project.client_email,
    })
    if (resendEmailId) {
      await supabase.from('email_events').insert({
        project_id: project.id,
        resend_email_id: resendEmailId,
        event_type: 'sent',
      })
    }

    return jsonResponse({ reminderId: reminder.id, status: 'sent' })
  } catch (error) {
    console.error('generate-smart-reminder error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
