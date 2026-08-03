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
    clientName: 'Alice Martin',
    clientEmail: 'alice@example.com',
    clientPhone: null,
    companyName: 'Studio AM',
    status: 'pending',
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
    ...overrides,
  }
}

describe('projectAttention', () => {
  const now = Date.now()

  it('classifies agency review and follow-up as action', () => {
    expect(
      isActionView(
        project({
          blockingOwner: 'agency',
          createdAt: new Date(now - 60 * 60 * 1000).toISOString(),
          lastReminderSentAt: new Date(now - 60 * 60 * 1000).toISOString(),
        }),
        now,
      ),
    ).toBe(true)

    expect(
      isActionView(
        project({
          blockingOwner: 'client',
          createdAt: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
          lastReminderSentAt: null,
        }),
        now,
      ),
    ).toBe(true)
  })

  it('puts fresh client-waiting projects in waiting only', () => {
    const p = project({
      status: 'in_progress',
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      lastReminderSentAt: new Date(now - 60 * 60 * 1000).toISOString(),
      blockingOwner: 'client',
      blockingSince: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    })
    expect(isActionView(p, now)).toBe(false)
    expect(isWaitingView(p, now)).toBe(true)
    expect(isBlockedView(p, now)).toBe(false)
  })

  it('marks stale bottlenecks as blocked (can overlap action)', () => {
    const p = project({
      createdAt: new Date(now - 100 * 60 * 60 * 1000).toISOString(),
      lastReminderSentAt: null,
      blockingOwner: 'client',
      blockingSince: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
    })
    expect(isBlockedView(p, now)).toBe(true)
    expect(isActionView(p, now)).toBe(true)
    expect(matchesAttentionView(p, 'blocked', now)).toBe(true)
    expect(matchesAttentionView(p, 'action', now)).toBe(true)
  })

  it('counts views with non-exclusive buckets', () => {
    const projects = [
      project({ id: 'a', status: 'completed' }),
      project({
        id: 'b',
        createdAt: new Date(now - 100 * 60 * 60 * 1000).toISOString(),
        lastReminderSentAt: null,
        blockingSince: new Date(now - 72 * 60 * 60 * 1000).toISOString(),
      }),
      project({
        id: 'c',
        status: 'in_progress',
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        lastReminderSentAt: new Date(now - 30 * 60 * 1000).toISOString(),
        blockingOwner: 'client',
        blockingSince: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      }),
    ]
    const counts = countAttentionViews(projects, now)
    expect(counts.all).toBe(3)
    expect(counts.done).toBe(1)
    expect(counts.waiting).toBe(1)
    expect(counts.blocked).toBe(1)
    expect(counts.action).toBe(1)
  })

  it('sorts stale_first by oldest activity among active projects', () => {
    const older = project({
      id: 'old',
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      lastReminderSentAt: null,
      blockingSince: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const newer = project({
      id: 'new',
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      lastReminderSentAt: new Date(now - 60 * 60 * 1000).toISOString(),
      blockingSince: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    })
    const done = project({ id: 'done', status: 'completed' })
    const sorted = sortProjects([newer, done, older], 'stale_first')
    expect(sorted.map((p) => p.id)).toEqual(['old', 'new', 'done'])
  })

  it('filters by client search', () => {
    expect(matchesSearchQuery(project(), 'alice')).toBe(true)
    expect(matchesSearchQuery(project(), 'studio')).toBe(true)
    expect(matchesSearchQuery(project(), 'zzz')).toBe(false)
  })

  it('returns contextual empty copy', () => {
    expect(getFilterEmptyCopy('blocked', { hasAnyProjects: true, hasSearch: false }).title).toMatch(
      /bloqué/i,
    )
    expect(getFilterEmptyCopy('action', { hasAnyProjects: true, hasSearch: false }).primaryAction).toBe(
      'view_waiting',
    )
    expect(getFilterEmptyCopy('all', { hasAnyProjects: false, hasSearch: false }).primaryAction).toBe(
      'create',
    )
  })
})
