import { describe, expect, it } from 'vitest'
import { formatPersonInitials, formatPersonName } from './formatPersonName'
import { avatarColorFromSeed } from '../components/ui/PersonAvatar'
import {
  ATTENTION_STATUS_LABELS,
  attentionBadgeVariant,
} from './clientListQuery'

describe('PersonAvatar helpers', () => {
  it('hashes seeds stably', () => {
    expect(avatarColorFromSeed('abc')).toBe(avatarColorFromSeed('abc'))
    expect(avatarColorFromSeed('abc')).not.toBe(avatarColorFromSeed('xyz'))
  })

  it('shares initials with formatPersonName', () => {
    expect(formatPersonInitials('théo', 'perret')).toBe('TP')
    expect(formatPersonName('théo', 'perret')).toBe('Théo Perret')
  })
})

describe('client list attention labels', () => {
  it('maps badge variants', () => {
    expect(attentionBadgeVariant('done')).toBe('completed')
    expect(attentionBadgeVariant('blocked')).toBe('in_progress')
    expect(attentionBadgeVariant('waiting')).toBe('pending')
    expect(ATTENTION_STATUS_LABELS.action).toBe('À traiter')
  })
})
