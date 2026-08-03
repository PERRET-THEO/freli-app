import type { LucideIcon } from 'lucide-react'
import {
  CirclePlus,
  FilePenLine,
  History,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Puzzle,
  Search,
  Settings2,
  UsersRound,
} from 'lucide-react'

export type NavBadgeKey = 'actionProjects' | 'pendingSignatures' | 'draftReminders'

export type NavDestination = {
  id: string
  label: string
  shortLabel?: string
  to: string
  icon: LucideIcon
  end?: boolean
  badgeKey?: NavBadgeKey
  /** Primary destinations shown in the main sidebar list */
  placement: 'primary' | 'footer' | 'mobile' | 'mobile-more' | 'action'
}

export const SIDEBAR_COOKIE = 'freli_sidebar_collapsed'
export const NAV_THEME_COOKIE = 'freli_nav_theme'
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const PRIMARY_NAV: NavDestination[] = [
  {
    id: 'overview',
    label: "Vue d'ensemble",
    shortLabel: 'Accueil',
    to: '/dashboard?view=action',
    icon: LayoutDashboard,
    end: true,
    badgeKey: 'actionProjects',
    placement: 'primary',
  },
  {
    id: 'clients',
    label: 'Clients',
    to: '/dashboard/clients',
    icon: UsersRound,
    placement: 'primary',
  },
  {
    id: 'contracts',
    label: 'Contrats',
    to: '/dashboard/templates',
    icon: FilePenLine,
    badgeKey: 'pendingSignatures',
    placement: 'primary',
  },
  {
    id: 'integrations',
    label: 'Intégrations',
    to: '/dashboard/integrations',
    icon: Puzzle,
    badgeKey: 'draftReminders',
    placement: 'primary',
  },
]

export const FOOTER_NAV: NavDestination[] = [
  {
    id: 'settings',
    label: 'Paramètres',
    to: '/dashboard/settings',
    icon: Settings2,
    placement: 'footer',
  },
]

/** Bottom bar slots (excluding FAB and overflow). */
export const MOBILE_PRIMARY_NAV: NavDestination[] = [
  PRIMARY_NAV[0],
  PRIMARY_NAV[1],
  PRIMARY_NAV[2],
]

export const MOBILE_MORE_NAV: NavDestination[] = [
  PRIMARY_NAV[3],
  FOOTER_NAV[0],
]

export const NEW_PROJECT_NAV: NavDestination = {
  id: 'new-project',
  label: 'Nouveau projet',
  shortLabel: 'Nouveau',
  to: '/dashboard/new',
  icon: CirclePlus,
  placement: 'action',
}

export const NAV_ICONS = {
  search: Search,
  logout: LogOut,
  history: History,
  panelCollapse: PanelLeftClose,
  panelExpand: PanelLeft,
} as const

export function allNavigableDestinations(): NavDestination[] {
  return [...PRIMARY_NAV, ...FOOTER_NAV, NEW_PROJECT_NAV]
}
