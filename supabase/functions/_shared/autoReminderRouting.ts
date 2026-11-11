/**
 * Aiguillage des relances automatiques (logique pure, testée).
 *
 * Règles produit :
 *   - Relances IA désactivées (ou add-on IA inactif) → relances classiques.
 *   - Relances IA activées → l'IA est prioritaire ; si elle ne peut pas envoyer
 *     (1ère relance non validée, envoi auto IA désactivé, génération en échec /
 *     timeout, crédits épuisés…), la relance classique part à sa place, sur la
 *     MÊME réservation (claim_auto_reminder) → jamais deux relances.
 *   - Résultat incertain (l'appel d'envoi a expiré) → on ne renvoie rien : la
 *     fonction d'envoi finalise elle-même la réservation.
 */

export type AiReminderSettings = {
  ai_reminders_enabled: boolean | null
  auto_reminders_enabled: boolean | null
  ai_reminder_auto_send?: boolean | null
}

/** L'agence est-elle gérée par le batch IA (sinon : batch classique) ? */
export function usesAiReminders(
  settings: AiReminderSettings | null | undefined,
  aiAddonActive: boolean,
): boolean {
  return settings?.ai_reminders_enabled === true && aiAddonActive
}

/** Filet de sécurité du batch classique pour les projets IA en retard. */
export const AI_FALLBACK_GRACE_HOURS = 24

export type DuePlan = 'ai_send_draft' | 'ai_generate_then_send' | 'classic'

/**
 * Projet dû et réservé : que tente-t-on en premier ?
 * L'IA n'envoie seule que si l'envoi auto est activé ET qu'une relance IA a déjà
 * été validée/envoyée pour ce projet (sinon la 1ère attend une validation).
 */
export function planDueReminder(input: {
  autoSend: boolean
  hasPriorAiSent: boolean
  hasSendableDraft: boolean
}): DuePlan {
  if (!input.autoSend || !input.hasPriorAiSent) return 'classic'
  return input.hasSendableDraft ? 'ai_send_draft' : 'ai_generate_then_send'
}

export type CallOutcome = { ok: boolean; timedOut: boolean }

export type NextStep =
  /** Relance partie, rien d'autre à faire. */
  | 'done'
  /** Rien n'est parti, la réservation est toujours active → classique. */
  | 'classic_same_claim'
  /** Rien n'est parti mais la réservation a été clôturée en échec → re-réserver puis classique. */
  | 'classic_new_claim'
  /** Envoi peut-être parti (timeout) → ne rien renvoyer. */
  | 'stop_uncertain'

/** Après la génération IA (aucun email envoyé à ce stade). */
export function afterAiGeneration(outcome: CallOutcome & { reminderId: string | null }): NextStep | 'send_draft' {
  if (outcome.ok && outcome.reminderId) return 'send_draft'
  // Échec, timeout ou génération ignorée (crédits) : rien n'est parti, la
  // réservation n'a pas été touchée par la génération.
  return 'classic_same_claim'
}

/** Après l'envoi d'un brouillon IA (send-smart-reminder). */
export function afterAiSend(outcome: CallOutcome): NextStep {
  if (outcome.ok) return 'done'
  if (outcome.timedOut) return 'stop_uncertain'
  // send-smart-reminder finalise la réservation en 'failed' sur erreur.
  return 'classic_new_claim'
}

/**
 * Exécute des tâches avec une concurrence bornée et un arrêt « doux » :
 * shouldStart() est vérifié avant chaque nouvelle tâche.
 * Retourne le nombre de tâches non démarrées.
 */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  shouldStart: () => boolean,
  worker: (item: T) => Promise<void>,
): Promise<number> {
  let next = 0
  let notStarted = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const index = next
      if (index >= items.length) return
      next += 1
      if (!shouldStart()) {
        notStarted += 1
        continue
      }
      await worker(items[index])
    }
  })
  await Promise.all(lanes)
  return notStarted
}
