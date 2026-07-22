export type ProjectStatus = 'pending' | 'in_progress' | 'completed'
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
}

export const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Tous',
  in_progress: 'En cours',
  pending: 'En attente',
  completed: 'Complétés',
}
