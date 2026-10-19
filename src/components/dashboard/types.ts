import {
  ATTENTION_VIEW_LABELS,
  ATTENTION_VIEW_SHORT_LABELS,
  type AgencyProjectStatus,
  type AttentionFilter,
} from '../../lib/status'

export type ProjectStatus = 'pending' | 'in_progress' | 'completed'

export type ProjectCardData = {
  id: string
  clientId: string | null
  /** Titre produit (projects.name), avec repli client_name côté mapping. */
  projectName: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  companyName: string | null
  status: ProjectStatus
  /** Statut UI exclusif — source SQL `project_derived_status`. */
  derivedStatus: AgencyProjectStatus
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
  /** Étape qui bloque actuellement l'onboarding (affichage uniquement). */
  blockingStepLabel: string | null
  blockingOwner: 'client' | 'agency' | null
  blockingSince: string | null
  inviteStatus?: 'pending' | 'sent' | 'failed' | null
  unreachableClient?: boolean
  consecutiveAutoReminders?: number
}

export type AttentionView = AttentionFilter

export const FILTER_LABELS = ATTENTION_VIEW_LABELS
export const FILTER_SHORT_LABELS = ATTENTION_VIEW_SHORT_LABELS
