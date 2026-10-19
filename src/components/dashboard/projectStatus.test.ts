import { describe, expect, it } from 'vitest'
import type { ProjectCardData } from './types'
import {
  getSecondaryIndicator,
  getShortStatusLabel,
  getStatusLabel,
} from './projectStatus'

describe('projectStatus labels', () => {
  it('uses derivedStatus labels', () => {
    expect(getStatusLabel({ derivedStatus: 'action_required' })).toBe('Action requise')
    expect(getStatusLabel({ derivedStatus: 'waiting_client' })).toBe('En attente client')
    expect(getStatusLabel({ derivedStatus: 'stalled' })).toBe('Bloqué')
    expect(getShortStatusLabel({ derivedStatus: 'completed' })).toBe('Terminé')
  })

  it('flags empty checklist as secondary label', () => {
    const project = {
      status: 'pending',
      totalCount: 0,
      derivedStatus: 'action_required',
      paymentStatus: null,
    } as ProjectCardData
    expect(getSecondaryIndicator(project, false, Date.now())).toEqual({
      type: 'empty_checklist',
      label: 'Checklist vide',
    })
  })
})
