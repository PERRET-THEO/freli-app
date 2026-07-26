import { describe, expect, it } from 'vitest'
import { getShortStatusLabel, getStatusLabel } from './projectStatus'

describe('getStatusLabel', () => {
  const now = Date.now()

  it('labels pending with no progress as waiting on client', () => {
    expect(
      getStatusLabel({
        status: 'pending',
        completedCount: 0,
        lastReminderSentAt: null,
        now,
      }),
    ).toBe('En attente du client')
  })

  it('labels pending with recent reminder', () => {
    expect(
      getStatusLabel({
        status: 'pending',
        completedCount: 0,
        lastReminderSentAt: new Date(now - 60 * 60 * 1000).toISOString(),
        now,
      }),
    ).toBe('Relancé · en attente')
  })

  it('labels in_progress as client-side', () => {
    expect(
      getStatusLabel({
        status: 'in_progress',
        completedCount: 2,
        lastReminderSentAt: null,
        now,
      }),
    ).toBe('En cours côté client')
  })
})

describe('getShortStatusLabel', () => {
  const now = Date.now()

  it('shortens long pending and in_progress labels', () => {
    expect(
      getShortStatusLabel({
        status: 'pending',
        completedCount: 0,
        lastReminderSentAt: new Date(now - 60 * 60 * 1000).toISOString(),
        now,
      }),
    ).toBe('Relancé')
    expect(
      getShortStatusLabel({
        status: 'pending',
        completedCount: 0,
        lastReminderSentAt: null,
        now,
      }),
    ).toBe('En attente')
    expect(
      getShortStatusLabel({
        status: 'in_progress',
        completedCount: 1,
        lastReminderSentAt: null,
        now,
      }),
    ).toBe('En cours')
  })
})
