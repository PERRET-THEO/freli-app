import { describe, expect, it } from 'vitest'
import type { ProjectCardData } from '../components/dashboard/types'
import {
  countAttentionViews,
  getFilterEmptyCopy,
  isActionView,
  isBlockedView,
  isWaitingView,
  matchesAttentionView,
  matchesSearchQuery,
  sortProjects,
} from './projectAttention'

function project(overrides: Partial<ProjectCardData> = {}): ProjectCardData {
  return {
    id: '1',
    clientId: 'client-1',
    projectName: 'Site web — Studio AM',
    clientName: 'Alice Martin',
    clientEmail: 'alice@example.com',
    clientPhone: null,
    companyName: 'Studio AM',
    status: 'pending',
    derivedStatus: 'waiting_client',
    token: 'tok',
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    lastReminderSentAt: null,
    lastReminderSource: null,
    price: null,
    paymentStatus: null,
    completedCount: 0,
    totalCount: 4,
    progress: 0,
    nextStepLabel: 'Brief',
    blockingStepLabel: 'Brief',
    blockingOwner: 'client',
    blockingSince: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    inviteStatus: 'sent',
    ...overrides,
  }
}

describe('projectAttention (derivedStatus)', () => {
  it('classifies from SQL token only', () => {
    expect(isActionView(project({ derivedStatus: 'action_required' }))).toBe(true)
    expect(isWaitingView(project({ derivedStatus: 'waiting_client' }))).toBe(true)
    expect(isBlockedView(project({ derivedStatus: 'stalled' }))).toBe(true)
    expect(
      matchesAttentionView(project({ derivedStatus: 'action_required' }), 'action_required'),
    ).toBe(true)
  })

  it('counts exclusively', () => {
    const counts = countAttentionViews([
      project({ id: 'a', derivedStatus: 'action_required' }),
      project({ id: 'b', derivedStatus: 'stalled' }),
      project({ id: 'c', derivedStatus: 'waiting_client' }),
    ])
    expect(counts.action_required).toBe(1)
    expect(counts.stalled).toBe(1)
    expect(counts.waiting_client).toBe(1)
    expect(counts.all).toBe(3)
  })

  it('sorts and searches', () => {
    const sorted = sortProjects(
      [
        project({ id: 'old', createdAt: '2020-01-01T00:00:00.000Z' }),
        project({ id: 'new', createdAt: '2024-01-01T00:00:00.000Z' }),
      ],
      'newest',
    )
    expect(sorted[0].id).toBe('new')
    expect(matchesSearchQuery(project(), 'alice')).toBe(true)
  })

  it('empty copy for action_required', () => {
    const copy = getFilterEmptyCopy('action_required', {
      hasAnyProjects: true,
      hasSearch: false,
    })
    expect(copy.title).toMatch(/Rien à traiter/)
  })
})
