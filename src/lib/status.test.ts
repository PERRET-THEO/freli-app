import { describe, expect, it } from 'vitest'
import {
  countAttentionFilters,
  deriveChecklistItemStatus,
  labelForAgencyProjectStatus,
  labelForChecklistItemStatus,
  matchesAttentionFilter,
  normalizeAgencyProjectStatus,
  normalizeAttentionFilter,
  statusColorToken,
} from './status'

describe('normalizeAgencyProjectStatus', () => {
  it('maps legacy aliases', () => {
    expect(normalizeAgencyProjectStatus('action')).toBe('action_required')
    expect(normalizeAgencyProjectStatus('waiting')).toBe('waiting_client')
    expect(normalizeAgencyProjectStatus('blocked')).toBe('stalled')
    expect(normalizeAgencyProjectStatus('done')).toBe('completed')
  })
})

describe('normalizeAttentionFilter', () => {
  it('keeps bookmarks working', () => {
    expect(normalizeAttentionFilter('action')).toBe('action_required')
    expect(normalizeAttentionFilter('blocked')).toBe('stalled')
    expect(normalizeAttentionFilter('all')).toBe('all')
  })
})

describe('countAttentionFilters exclusive', () => {
  it('sums buckets without overlap', () => {
    const projects = [
      { derivedStatus: 'action_required' as const },
      { derivedStatus: 'waiting_client' as const },
      { derivedStatus: 'stalled' as const },
      { derivedStatus: 'completed' as const },
      { derivedStatus: 'draft' as const },
    ]
    const counts = countAttentionFilters(projects)
    expect(counts.all).toBe(5)
    expect(
      counts.action_required +
        counts.waiting_client +
        counts.stalled +
        counts.completed +
        counts.draft,
    ).toBe(5)
    expect(matchesAttentionFilter(projects[0], 'action_required')).toBe(true)
    expect(matchesAttentionFilter(projects[0], 'stalled')).toBe(false)
  })
})

describe('deriveChecklistItemStatus', () => {
  it('maps submitted / validated / changes_requested / todo', () => {
    expect(
      deriveChecklistItemStatus({
        completed: true,
        type: 'text',
        review_status: 'pending',
      }),
    ).toBe('submitted')
    expect(
      deriveChecklistItemStatus({
        completed: true,
        type: 'text',
        review_status: 'approved',
      }),
    ).toBe('validated')
    expect(
      deriveChecklistItemStatus({
        completed: false,
        type: 'text',
        review_status: 'rejected',
      }),
    ).toBe('changes_requested')
    expect(
      deriveChecklistItemStatus({
        completed: false,
        type: 'text',
        review_status: 'pending',
      }),
    ).toBe('todo')
    expect(
      deriveChecklistItemStatus({
        completed: true,
        type: 'signature',
        review_status: 'pending',
      }),
    ).toBe('validated')
  })

  it('exposes distinct client vs agency labels', () => {
    expect(labelForChecklistItemStatus('submitted', 'client')).toContain('vérification')
    expect(labelForChecklistItemStatus('submitted', 'agency')).toBe('À valider')
    expect(labelForAgencyProjectStatus('action_required')).toBe('Action requise')
  })
})

describe('statusColorToken', () => {
  it('keeps action out of blue info', () => {
    expect(statusColorToken('action_required')).toBe('action')
    expect(statusColorToken('submitted')).toBe('info')
    expect(statusColorToken('waiting_client')).toBe('waiting')
    expect(statusColorToken('completed')).toBe('done')
  })
})
