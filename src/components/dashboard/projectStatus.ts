import { formatRelative } from '../../lib/formatRelative'
import {
  labelForAgencyProjectStatus,
  type AgencyProjectStatus,
} from '../../lib/status'
import type { ProjectCardData } from './types'

export function getStatusLabel(project: {
  derivedStatus?: AgencyProjectStatus | null
  status?: string
}): string {
  if (project.derivedStatus) return labelForAgencyProjectStatus(project.derivedStatus)
  if (project.status === 'completed') return 'Terminé'
  return 'En attente client'
}

export function getShortStatusLabel(project: {
  derivedStatus?: AgencyProjectStatus | null
  status?: string
}): string {
  return getStatusLabel(project)
}

export function getSecondaryIndicator(
  project: ProjectCardData,
  pendingExtraction: boolean,
  _now: number,
): {
  type: 'relancer' | 'extraction' | 'payment' | 'empty_checklist' | null
  label: string
} {
  if (project.status !== 'completed' && project.totalCount === 0) {
    return { type: 'empty_checklist', label: 'Checklist vide' }
  }
  if (project.derivedStatus === 'stalled') return { type: 'relancer', label: 'À relancer' }
  if (pendingExtraction) return { type: 'extraction', label: 'Données à valider' }
  if (project.paymentStatus === 'failed') return { type: 'payment', label: 'Paiement en échec' }
  return { type: null, label: '' }
}

export function getActivityLabel(project: ProjectCardData, now: number): string {
  const reminderFreshness = project.lastReminderSentAt
    ? now - new Date(project.lastReminderSentAt).getTime()
    : Infinity
  const reminderSentRecently = reminderFreshness < 72 * 60 * 60 * 1000
  const reminderKindLabel =
    project.lastReminderSource === 'manual' ? 'Relance manuelle' : 'Relance auto'

  if (reminderSentRecently && project.lastReminderSentAt) {
    return `${reminderKindLabel} ${formatRelative(project.lastReminderSentAt, now)}`
  }
  return `Créé ${formatRelative(project.createdAt, now)}`
}
