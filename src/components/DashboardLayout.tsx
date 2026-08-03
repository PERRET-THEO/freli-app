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
    <div className="min-h-screen bg-[var(--surface)]">
      <AppSidebar />
      <CommandPalette />

      <div
        className={`mx-auto min-w-0 transition-[margin] duration-200 ease-out md:ml-[var(--sidebar-current-width)] ${contentMax}`}
      >
        <main className="w-full min-w-0 px-4 py-8 pb-24 sm:px-8 md:pb-8">
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
      </div>

      <MobileBottomNav />
    </div>
  )
}
