import {
  ATTENTION_VIEW_LABELS,
  ATTENTION_VIEW_SHORT_LABELS,
  ATTENTION_VIEWS,
  type AttentionView,
} from '../../lib/projectAttention'

export type ProjectStatus = 'pending' | 'in_progress' | 'completed'

/** @deprecated Prefer AttentionView — kept for gradual migration of KPIs. */
export type StatusFilter = 'all' | ProjectStatus

export type ProjectCardData = {
  id: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  companyName: string | null
  status: ProjectStatus
  token: string
  createdAt: string
  lastReminderSentAt: string | null
  lastReminderSource: 'auto' | 'manual' | null
  price: number | null
  paymentStatus: string | null
  completedCount: number
  totalCount: number
  progress: number
  nextStepLabel: string | null
  /** Étape qui bloque actuellement l'onboarding (client ou revue agence). */
  blockingStepLabel: string | null
  blockingOwner: 'client' | 'agency' | null
  blockingSince: string | null
}

export type { AttentionView }

export const FILTER_LABELS = ATTENTION_VIEW_LABELS
export const FILTER_SHORT_LABELS = ATTENTION_VIEW_SHORT_LABELS
export const FILTER_ORDER = ATTENTION_VIEWS
