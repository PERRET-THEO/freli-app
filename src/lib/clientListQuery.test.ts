import { describe, expect, it } from 'vitest'
import {
  ATTENTION_STATUS_LABELS,
  attentionBadgeVariant,
} from './clientListQuery'

describe('clientListQuery attention mapping', () => {
  it('maps badge variants to new status tokens', () => {
    expect(attentionBadgeVariant('done')).toBe('completed')
    expect(attentionBadgeVariant('blocked')).toBe('stalled')
    expect(attentionBadgeVariant('waiting')).toBe('waiting_client')
    expect(attentionBadgeVariant('action_required')).toBe('action_required')
    expect(ATTENTION_STATUS_LABELS.action_required).toBe('Action requise')
    expect(ATTENTION_STATUS_LABELS.action).toBe('Action requise')
  })
})
