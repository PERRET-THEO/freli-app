import type { ReactNode } from 'react'
import { useAgencySession } from '../contexts/AgencyContext'
import { AppSidebar } from './app-shell/AppSidebar'
import { CommandPalette } from './app-shell/CommandPalette'
import { MobileBottomNav } from './app-shell/MobileBottomNav'

type DashboardLayoutProps = {
  children: ReactNode
  title?: string
  subtitle?: string
  maxWidth?: '4xl' | '5xl' | '7xl'
  loading?: boolean
  skeleton?: ReactNode
}

const maxWidthClass: Record<NonNullable<DashboardLayoutProps['maxWidth']>, string> = {
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '7xl': 'max-w-7xl',
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  maxWidth = '7xl',
  loading = false,
  skeleton,
}: DashboardLayoutProps) {
  const { loading: sessionLoading } = useAgencySession()
  const contentMax = maxWidthClass[maxWidth]
  const showSkeleton = (sessionLoading || loading) && skeleton

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--surface)] md:block md:min-h-dvh md:h-auto md:overflow-visible">
      <AppSidebar />
      <CommandPalette />

      <div
        className={`mx-auto flex min-h-0 min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out md:ml-[var(--sidebar-current-width)] md:block md:flex-none ${contentMax}`}
      >
        <main className="w-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-y-contain px-4 py-6 pt-[max(1.5rem,var(--safe-top))] sm:px-8 md:overflow-visible md:py-8 md:pt-8">
          {title ? (
            <header className="mb-6">
              <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">{subtitle}</p>
              ) : null}
            </header>
          ) : null}
          {showSkeleton ? (
            skeleton
          ) : sessionLoading ? (
            <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
          ) : (
            children
          )}
        </main>

        <div className="shrink-0 md:hidden">
          <MobileBottomNav />
        </div>
      </div>
    </div>
  )
}
