/**
 * Cœur de génération d'un brouillon de relance IA (Gemini).
 * Appelé in-process depuis request-smart-reminder (waitUntil) et generate-smart-reminder (HTTP).
 * Pas de fetch inter-Edge-Function.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { chatJsonSchema, logAiUsage, MODEL_SMALL } from './ai-provider.ts'
import { getClientPendingActions } from './clientPendingActions.ts'
import { getVisibleProgressCounts } from './progressHelpers.ts'
import { REMINDER_JSON_SCHEMA } from './documentSchemas.ts'
import { assertAiAddonActive, consumeAiCredit } from './aiEntitlements.ts'
import {
  buildFallbackReminder,
  parseReminderPayload,
  sanitizeCorrectionNotes,
  validateReminderFacts,
  REMINDER_PROMPT_VERSION,
} from './aiValidation.ts'
import { isWithinParisSendWindow } from './smartReminderBehavior.ts'

export type BehaviorCategory = 'not_opened' | 'opened_not_clicked' | 'stuck_on_step'

export type GenerateSmartReminderInput = {
  projectId: string
  behaviorCategory: BehaviorCategory
  blockingStepLabel?: string | null
  clientActionLabels?: string[]
  progress?: { completedVisible: number; totalVisible: number; percent: number }
  /** Placeholder async : UPDATE generating → draft (même id). */
  reminderId?: string
  /** Si true, le caller peut tenter claim + envoi (infos renvoyées). */
  attemptClaim?: boolean
}

export type GenerateSmartReminderResult =
  | {
      ok: true
      reminderId: string
      status: 'draft'
      previewRequired: boolean
      deferredOutsideWindow: boolean
      wantAutoSend: boolean
      subject: string
      bodyText: string
      agencyName: string
      clientEmail: string
      projectToken: string
      autoSend: boolean
      withinSendWindow: boolean
    }
  | {
      ok: false
      skipped?: boolean
      reason: string
      code?: string
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

type GeneratedReminder = {
  subject: string
  body: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  usedFallback: boolean
}

/** Génère (ou met à jour) un brouillon draft. N'envoie pas l'email. */
export async function generateSmartReminderDraft(
  supabase: SupabaseClient,
  input: GenerateSmartReminderInput,
): Promise<GenerateSmartReminderResult> {
  if (!(input.behaviorCategory in BEHAVIOR_INSTRUCTIONS)) {
    return { ok: false, reason: 'behaviorCategory invalide' }
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, token, client_name, client_email, agency_id, agencies(name, ai_reminders_enabled, ai_reminder_tone, ai_reminder_auto_send, ai_reminder_send_hour_start, ai_reminder_send_hour_end)',
    )
    .eq('id', input.projectId)
    .single()
  if (projectError || !project) {
    return { ok: false, reason: 'Projet introuvable' }
  }

  const agencyRel = project.agencies as
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null
  const agency = (Array.isArray(agencyRel) ? agencyRel[0] : agencyRel) ?? {}
  if (agency.ai_reminders_enabled !== true) {
    return { ok: false, skipped: true, reason: 'Module relances IA désactivé' }
  }

  const addonDenied = await assertAiAddonActive(supabase, project.agency_id)
  if (addonDenied) {
    return { ok: false, skipped: true, reason: addonDenied.error, code: addonDenied.code }
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
    return { ok: false, skipped: true, reason: 'Aucune action client en attente' }
  }

  const clientActionLabels =
    input.clientActionLabels && input.clientActionLabels.length > 0
      ? input.clientActionLabels
      : clientActions.map((row) => String(row.label ?? ''))

  const progressCounts = getVisibleProgressCounts(allRows ?? [])
  const progress = input.progress ?? {
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
    `Comportement détecté : ${BEHAVIOR_INSTRUCTIONS[input.behaviorCategory]}`,
    `Ton de marque : ${TONE_INSTRUCTIONS[tone]}`,
    `Avancement factuel : ${progress.completedVisible}/${progress.totalVisible} étapes visibles complétées (${progress.percent} %).`,
    `Nombre d'actions encore attendues côté client : ${clientActionLabels.length}.`,
    `Actions côté client (à citer uniquement) : ${clientActionLabels
      .map((label) => `« ${label} »`)
      .join(', ')}.`,
  ]
  if (input.behaviorCategory === 'stuck_on_step' && input.blockingStepLabel) {
    contextLines.push(
      `Action client prioritaire (première de la liste) : « ${input.blockingStepLabel} »`,
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

  let creditsConsumed = 0
  if (!generated.usedFallback) {
    const credit = await consumeAiCredit(supabase, {
      agencyId: project.agency_id,
      feature: 'reminders',
    })
    if (!credit.ok) {
      return { ok: false, skipped: true, reason: credit.message, code: credit.code }
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
    input.attemptClaim === true && autoSend && !requirePreview && withinSendWindow

  const draftFields = {
    behavior_category: input.behaviorCategory,
    blocking_step_label: input.blockingStepLabel ?? clientActionLabels[0] ?? null,
    subject,
    body: bodyText,
    tone,
    status: 'draft' as const,
    model_used: generated.model,
    prompt_version: REMINDER_PROMPT_VERSION,
  }

  let reminder: { id: string } | null = null
  if (input.reminderId) {
    const { data: updated, error: updateError } = await supabase
      .from('smart_reminders')
      .update(draftFields)
      .eq('id', input.reminderId)
      .eq('project_id', project.id)
      .eq('status', 'generating')
      .select('id')
      .maybeSingle()
    if (updateError) throw new Error(updateError.message)
    if (!updated) {
      const { data: inserted, error: insertError } = await supabase
        .from('smart_reminders')
        .insert({
          project_id: project.id,
          agency_id: project.agency_id,
          ...draftFields,
        })
        .select('id')
        .single()
      if (insertError || !inserted) throw new Error(insertError?.message ?? 'Insert failed')
      reminder = inserted
    } else {
      reminder = updated
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('smart_reminders')
      .insert({
        project_id: project.id,
        agency_id: project.agency_id,
        ...draftFields,
      })
      .select('id')
      .single()
    if (insertError || !inserted) throw new Error(insertError?.message ?? 'Insert failed')
    reminder = inserted
  }

  return {
    ok: true,
    reminderId: reminder.id,
    status: 'draft',
    previewRequired: requirePreview,
    deferredOutsideWindow: autoSend && !requirePreview && !withinSendWindow,
    wantAutoSend,
    subject,
    bodyText,
    agencyName,
    clientEmail: project.client_email,
    projectToken: project.token,
    autoSend,
    withinSendWindow,
  }
}
