import { formatRelative } from '../../lib/formatRelative'
import type { ProjectCardData, ProjectStatus } from './types'

type ProjectStatusInput = {
  status: ProjectStatus
  completedCount: number
  lastReminderSentAt: string | null
  now: number
}

export function getStatusLabel({
  status,
  completedCount,
  lastReminderSentAt,
  now,
}: ProjectStatusInput): string {
  if (status === 'completed') return 'Complété'
  if (status === 'in_progress') return 'En cours côté client'
  if (status === 'pending') {
    const reminderFresh =
      lastReminderSentAt && now - new Date(lastReminderSentAt).getTime() < 72 * 60 * 60 * 1000
    if (reminderFresh) return 'Relancé · en attente'
    if (completedCount === 0) return 'En attente du client'
    return 'En attente'
  }
  return 'En attente'
}

/** Compact labels for tight mobile badges; keep full label in `title`. */
export function getShortStatusLabel(input: ProjectStatusInput): string {
  const full = getStatusLabel(input)
  if (input.status === 'completed') return 'Complété'
  if (input.status === 'in_progress') return 'En cours'
  if (full.startsWith('Relancé')) return 'Relancé'
  return 'En attente'
}

export function getSecondaryIndicator(
  project: ProjectCardData,
  pendingExtraction: boolean,
  now: number,
): { type: 'relancer' | 'extraction' | 'payment' | null; label: string } {
  const reminderFreshness = project.lastReminderSentAt
    ? now - new Date(project.lastReminderSentAt).getTime()
    : Infinity
  const reminderSentRecently = reminderFreshness < 72 * 60 * 60 * 1000
  const ageMs = now - new Date(project.createdAt).getTime()
  const needsAction =
    project.status !== 'completed' &&
    ageMs > 48 * 60 * 60 * 1000 &&
    !reminderSentRecently

  if (needsAction) return { type: 'relancer', label: 'À relancer' }
  if (pendingExtraction) return { type: 'extraction', label: 'Données à valider' }
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
