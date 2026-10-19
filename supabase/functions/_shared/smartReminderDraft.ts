/**
 * Validité d'un brouillon de relance IA.
 * Un draft est inutilisable s'il a été généré avec une ancienne version de prompt,
 * ou si l'étape ciblée n'est plus une action côté client.
 */
import { REMINDER_PROMPT_VERSION } from './aiValidation.ts'

export type DraftLike = {
  id: string
  status: string
  blocking_step_label?: string | null
  prompt_version?: string | null
  behavior_category?: string | null
}

export function isDraftPromptCurrent(
  draft: Pick<DraftLike, 'prompt_version'>,
  currentVersion: string = REMINDER_PROMPT_VERSION,
): boolean {
  return draft.prompt_version === currentVersion
}

export function isDraftTargetStillClientAction(
  draft: Pick<DraftLike, 'blocking_step_label' | 'behavior_category'>,
  clientActionLabels: string[],
): boolean {
  // Sans étape ciblée (not_opened / opened_not_clicked) : OK tant qu'il reste des actions.
  if (!draft.blocking_step_label) {
    return clientActionLabels.length > 0
  }
  return clientActionLabels.includes(draft.blocking_step_label)
}

/** true si le brouillon peut encore être proposé / auto-envoyé. */
export function isDraftSendable(
  draft: DraftLike,
  clientActionLabels: string[],
  currentVersion: string = REMINDER_PROMPT_VERSION,
): boolean {
  if (draft.status !== 'draft') return false
  if (!isDraftPromptCurrent(draft, currentVersion)) return false
  return isDraftTargetStillClientAction(draft, clientActionLabels)
}

export function draftStaleReason(
  draft: DraftLike,
  clientActionLabels: string[],
  currentVersion: string = REMINDER_PROMPT_VERSION,
): 'wrong_prompt_version' | 'target_not_client_action' | null {
  if (draft.status !== 'draft') return null
  if (!isDraftPromptCurrent(draft, currentVersion)) return 'wrong_prompt_version'
  if (!isDraftTargetStillClientAction(draft, clientActionLabels)) {
    return 'target_not_client_action'
  }
  return null
}
