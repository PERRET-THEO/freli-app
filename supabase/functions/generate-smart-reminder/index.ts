/**
 * Génération du CONTENU d'une relance intelligente (Gemini).
 *
 * La décision d'envoyer (timing, plafond) est déterministe via claim_auto_reminder.
 * Ici : rédaction via chatJsonSchema / MODEL_SMALL + contrôle factuel.
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
import { getClientPendingActions } from '../_shared/clientPendingActions.ts'
import { getVisibleProgressCounts } from '../_shared/progressHelpers.ts'
import { REMINDER_JSON_SCHEMA } from '../_shared/documentSchemas.ts'
import { assertAiAddonActive, consumeAiCredit } from '../_shared/aiEntitlements.ts'
import {
  buildFallbackReminder,
  parseReminderPayload,
  sanitizeCorrectionNotes,
  validateReminderFacts,
  REMINDER_PROMPT_VERSION,
} from '../_shared/aiValidation.ts'
import { claimAutoReminder, finalizeAutoReminder } from '../_shared/reminderClaim.ts'
import { isWithinParisSendWindow } from '../_shared/smartReminderBehavior.ts'

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
  clientActionLabels?: string[]
  progress?: { completedVisible: number; totalVisible: number; percent: number }
  /** Si true, tente claim + envoi auto après génération. */
  attemptClaim?: boolean
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
    "Le client a ouvert ou cliqué dans les emails mais n'a pas terminé son onboarding (portail non visité ou parcours inachevé). Mets en avant un bénéfice concret (gain de temps, projet qui démarre plus vite) et rassure (« cela ne prend que quelques minutes », lien direct, aucune création de compte).",
  stuck_on_step:
    "Le client a commencé son parcours et a encore des actions à faire. Cite UNIQUEMENT les actions client listées dans le contexte (libellés exacts). Ne parle pas des étapes en attente de validation agence. Rassure sur la simplicité sans inventer le nombre d'actions restantes.",
}

const SYSTEM_PROMPT = `Tu rédiges des emails de relance d'onboarding pour le compte d'agences et de freelances.

Règles impératives :
- "subject" : objet d'email en français, 60 caractères maximum.
- "body" : corps en français, 60 à 120 mots, texte brut (pas de HTML, pas de markdown). Sépare les paragraphes par une ligne vide. Ne mets PAS de formule d'appel à l'action avec lien : le bouton est ajouté automatiquement sous ton texte. Termine par une formule de politesse simple signée du nom de l'agence.
- INTERDICTION ABSOLUE de promettre quoi que ce soit d'ordre commercial ou financier : aucune remise, aucun geste commercial, aucun délai contractuel, aucun engagement au nom de l'agence.
- N'invente aucune information sur le projet : utilise uniquement les éléments fournis.
- INTERDICTION d'affirmer que le parcours est « presque terminé », qu'il « ne reste qu'une seule action / une étape », ou « il ne vous reste que cette action », ou tout chiffre d'avancement, SAUF si le contexte factuel fourni le confirme explicitement (ex. exactement 1 action client restante).
- Ne cite que les actions côté client listées. N'invente pas d'autres étapes.
- Motifs de correction : ne JAMAIS recopier une note interne mot pour mot ni entre guillemets. Reformule de façon professionnelle, factuelle et bienveillante (ex. « le document doit être ajusté : … »). Si le contexte indique qu'aucun détail n'est fourni, mentionne seulement que l'étape doit être ajustée.`

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
        'id, token, client_name, client_email, agency_id, agencies(name, ai_reminders_enabled, ai_reminder_tone, ai_reminder_auto_send, ai_reminder_send_hour_start, ai_reminder_send_hour_end)',
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

    const agencyName = typeof agency.name === 'string' && agency.name ? agency.name : 'Votre agence'
    const tone =
      typeof agency.ai_reminder_tone === 'string' && agency.ai_reminder_tone in TONE_INSTRUCTIONS
        ? agency.ai_reminder_tone
        : 'professional'
    const autoSend = agency.ai_reminder_auto_send === true
    const sendHourStart =
      typeof agency.ai_reminder_send_hour_start === 'number' ? agency.ai_reminder_send_hour_start : 9
    const sendHourEnd =
      typeof agency.ai_reminder_send_hour_end === 'number' ? agency.ai_reminder_send_hour_end : 19
    const withinSendWindow = isWithinParisSendWindow(new Date(), sendHourStart, sendHourEnd)

    const firstName = project.client_name.trim().split(/\s+/)[0] ?? project.client_name

    const { data: allRows } = await supabase
      .from('checklist_items')
      .select('label, type, completed, value, review_note, review_status, config, order_index')
      .eq('project_id', project.id)
      .order('order_index', { ascending: true })

    const clientActions = getClientPendingActions(allRows ?? [])
    if (clientActions.length === 0) {
      return jsonResponse({ skipped: true, reason: 'Aucune action client en attente' })
    }

    const clientActionLabels =
      body.clientActionLabels && body.clientActionLabels.length > 0
        ? body.clientActionLabels
        : clientActions.map((row) => String(row.label ?? ''))

    const progressCounts = getVisibleProgressCounts(allRows ?? [])
    const progress = body.progress ?? {
      completedVisible: progressCounts.completed,
      totalVisible: progressCounts.total,
      percent: progressCounts.percent,
    }

    const rawCorrections = clientActions
      .filter((row) => row.review_status === 'rejected' && String(row.review_note ?? '').trim())
      .map((row) => ({
        label: String(row.label ?? ''),
        note: String(row.review_note ?? '').trim(),
      }))
    const sanitizedCorrections = sanitizeCorrectionNotes(rawCorrections)
    const correctionLabels = sanitizedCorrections.map((row) => row.label)
    const forbiddenVerbatimNotes = sanitizedCorrections
      .map((row) => row.rawNote)
      .filter((note) => note.length >= 4)

    const contextLines = [
      `Prénom du client : ${firstName}`,
      `Nom de l'agence : ${agencyName}`,
      `Comportement détecté : ${BEHAVIOR_INSTRUCTIONS[body.behaviorCategory]}`,
      `Ton de marque : ${TONE_INSTRUCTIONS[tone]}`,
      `Avancement factuel : ${progress.completedVisible}/${progress.totalVisible} étapes visibles complétées (${progress.percent} %).`,
      `Nombre d'actions encore attendues côté client : ${clientActionLabels.length}.`,
      `Actions côté client (à citer uniquement) : ${clientActionLabels
        .map((label) => `« ${label} »`)
        .join(', ')}.`,
    ]
    if (body.behaviorCategory === 'stuck_on_step' && body.blockingStepLabel) {
      contextLines.push(
        `Action client prioritaire (première de la liste) : « ${body.blockingStepLabel} »`,
      )
    }
    if (sanitizedCorrections.length > 0) {
      const lines = sanitizedCorrections.map((row) => {
        if (row.noteForPrompt) {
          return `« ${row.label} » — motif interne à REFORMULER (ne jamais recopier) : ${row.noteForPrompt}`
        }
        return `« ${row.label} » — aucun détail communicable ; indique seulement que cette étape doit être ajustée.`
      })
      contextLines.push(
        `Corrections demandées (reformulation obligatoire) : ${lines.join(' ; ')}`,
        'Ne cite jamais une note interne entre guillemets. Formule professionnelle et bienveillante uniquement.',
      )
    }

    const facts = {
      clientActionCount: clientActionLabels.length,
      clientActionLabels,
      completedVisible: progress.completedVisible,
      totalVisible: progress.totalVisible,
      percent: progress.percent,
      forbiddenVerbatimNotes,
    }

    type GeneratedReminder = {
      subject: string
      body: string
      model: string
      inputTokens: number
      outputTokens: number
      durationMs: number
      usedFallback: boolean
    }

    async function generateOnce(): Promise<GeneratedReminder> {
      const result = await chatJsonSchema<{ subject?: string; body?: string }>({
        model: MODEL_SMALL,
        system: SYSTEM_PROMPT,
        user: contextLines.join('\n'),
        schema: REMINDER_JSON_SCHEMA,
        schemaName: 'smart_reminder',
        maxTokens: 600,
        temperature: 0.7,
      })
      const parsed = parseReminderPayload(result.parsed)
      if (!parsed.ok) {
        throw new Error(`Réponse IA invalide: ${parsed.error}`)
      }
      const factsCheck = validateReminderFacts(parsed.subject, parsed.body, facts)
      if (!factsCheck.ok) {
        throw new Error(`facts_mismatch:${factsCheck.error}`)
      }
      return {
        subject: parsed.subject,
        body: parsed.body,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
        usedFallback: false,
      }
    }

    let generated: GeneratedReminder
    try {
      generated = await generateOnce()
    } catch (firstError) {
      const msg = firstError instanceof Error ? firstError.message : String(firstError)
      if (msg.startsWith('facts_mismatch:')) {
        contextLines.push(
          `ATTENTION : la rédaction précédente était inexacte (${msg.slice('facts_mismatch:'.length)}). Respecte strictement les chiffres, libellés, et n'utilise jamais une note interne mot pour mot.`,
        )
        try {
          generated = await generateOnce()
        } catch {
          // Contrôle échoué après régénération : fallback template, pas de crédit IA « perdu » sans contenu.
          const fallback = buildFallbackReminder({
            firstName,
            agencyName,
            clientActionLabels,
            correctionLabels,
          })
          generated = {
            subject: fallback.subject,
            body: fallback.body,
            model: 'fallback_template',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 0,
            usedFallback: true,
          }
        }
      } else {
        throw firstError
      }
    }

    const subject = generated.subject
    const bodyText = generated.body

    // Crédit uniquement si un contenu acceptable est prêt (IA validée ou fallback).
    // Un rejet facts_mismatch sans fallback ne passe pas ici.
    let creditsConsumed = 0
    if (!generated.usedFallback) {
      const credit = await consumeAiCredit(supabase, {
        agencyId: project.agency_id,
        feature: 'reminders',
      })
      if (!credit.ok) {
        return jsonResponse({ skipped: true, reason: credit.message, code: credit.code })
      }
      creditsConsumed = 1
    }

    await logAiUsage(supabase, {
      agencyId: project.agency_id,
      projectId: project.id,
      feature: 'reminders',
      operation: 'chat',
      model: generated.model,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      durationMs: generated.durationMs,
      promptVersion: REMINDER_PROMPT_VERSION,
      creditsConsumed,
    })

    const { count: priorSent } = await supabase
      .from('smart_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'sent')
    const requirePreview = (priorSent ?? 0) === 0
    const wantAutoSend =
      body.attemptClaim === true && autoSend && !requirePreview && withinSendWindow

    const { data: reminder, error: insertError } = await supabase
      .from('smart_reminders')
      .insert({
        project_id: project.id,
        agency_id: project.agency_id,
        behavior_category: body.behaviorCategory,
        blocking_step_label: body.blockingStepLabel ?? clientActionLabels[0] ?? null,
        subject,
        body: bodyText,
        tone,
        status: 'draft',
        model_used: generated.model,
        prompt_version: REMINDER_PROMPT_VERSION,
      })
      .select('id')
      .single()
    if (insertError || !reminder) throw new Error(insertError?.message ?? 'Insert failed')

    if (!wantAutoSend) {
      return jsonResponse({
        reminderId: reminder.id,
        status: 'draft',
        previewRequired: requirePreview,
        deferredOutsideWindow: autoSend && !requirePreview && !withinSendWindow,
      })
    }

    const claim = await claimAutoReminder(supabase, project.id)
    if (!claim.ok) {
      return jsonResponse({
        reminderId: reminder.id,
        status: 'draft',
        claimSkipped: claim.errorCode,
      })
    }

    const portalUrl = `${appUrl}/p/${project.token}`
    try {
      let resendEmailId: string | null = null
      if (isDevMode()) {
        console.log('MODE DEV — Relance IA simulée pour:', project.client_email, subject)
        resendEmailId = null
      } else {
        const sendResult = await resend.emails.send({
          from: getResendFrom(),
          to: project.client_email,
          subject,
          html: buildSmartReminderEmail({ bodyText, agencyName, portalUrl }),
        })
        assertResendOk(sendResult)
        resendEmailId = (sendResult.data as { id?: string } | null)?.id ?? null
      }

      const now = new Date().toISOString()
      await supabase
        .from('smart_reminders')
        .update({
          subject,
          body: bodyText,
          status: 'sent',
          sent_at: now,
          resend_email_id: resendEmailId,
        })
        .eq('id', reminder.id)
      await finalizeAutoReminder(supabase, claim.logId, 'sent')
      if (resendEmailId) {
        await supabase.from('email_events').insert({
          project_id: project.id,
          resend_email_id: resendEmailId,
          event_type: 'sent',
        })
      } else if (isDevMode()) {
        await supabase.from('email_events').insert({
          project_id: project.id,
          resend_email_id: `dev-sim-${reminder.id}`,
          event_type: 'sent',
        })
      }
      return jsonResponse({ reminderId: reminder.id, status: 'sent', simulated: isDevMode() })
    } catch (sendError) {
      await finalizeAutoReminder(supabase, claim.logId, 'failed')
      throw sendError
    }
  } catch (error) {
    console.error('generate-smart-reminder error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
