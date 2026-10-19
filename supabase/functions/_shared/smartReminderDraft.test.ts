import { describe, expect, it } from 'vitest'
import { REMINDER_PROMPT_VERSION } from './aiValidation.ts'
import { draftStaleReason, isDraftSendable } from './smartReminderDraft.ts'

describe('smartReminderDraft', () => {
  const draft = {
    id: '1',
    status: 'draft',
    blocking_step_label: 'Charte UI',
    prompt_version: REMINDER_PROMPT_VERSION,
    behavior_category: 'stuck_on_step',
  }

  it('accepte un brouillon à jour ciblant une action client', () => {
    expect(isDraftSendable(draft, ['Charte UI', 'Logo'])).toBe(true)
    expect(draftStaleReason(draft, ['Charte UI'])).toBeNull()
  })

  it('marque stale si prompt_version antérieure ou absente', () => {
    expect(
      draftStaleReason(
        { ...draft, prompt_version: 'reminder_v1_2026_08' },
        ['Charte UI'],
      ),
    ).toBe('wrong_prompt_version')
    expect(draftStaleReason({ ...draft, prompt_version: null }, ['Charte UI'])).toBe(
      'wrong_prompt_version',
    )
  })

  it('marque stale si l’étape ciblée n’est plus une action client', () => {
    expect(draftStaleReason(draft, ['Logo'])).toBe('target_not_client_action')
    expect(isDraftSendable(draft, ['Logo'])).toBe(false)
  })
})
