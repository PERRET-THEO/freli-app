import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type OverflowMenuItem = {
  label: string
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}

type TemplateItemCardProps = {
  highlighted?: boolean
  icon: ReactNode
  title: string
  meta?: string
  headerBadge?: ReactNode
  badges?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  menuItems?: OverflowMenuItem[]
}

export function TemplateItemCard({
  highlighted = false,
  icon,
  title,
  meta,
  headerBadge,
  badges,
  children,
  footer,
  menuItems,
}: TemplateItemCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const hasMenu = menuItems && menuItems.length > 0

  return (
    <div className="relative min-w-0">
      <div
        className={`min-w-0 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--white)] p-4 shadow-[0_2px_16px_rgba(13,15,20,0.06),0_0_0_1px_rgba(13,15,20,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(13,15,20,0.08),0_0_0_1px_rgba(13,15,20,0.06)] sm:p-5 ${
          highlighted ? 'ring-1 ring-[var(--accent)]/20' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0">{icon}</div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="line-clamp-2 break-words font-display text-[17px] font-bold text-[var(--ink)]">
                  {title}
                </h2>
                {meta ? (
                  <p className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">{meta}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {headerBadge}
                {hasMenu ? (
                  <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    className="touch-target flex items-center justify-center rounded-full text-[var(--ink-muted)] transition hover:bg-[var(--surface-warm)] hover:text-[var(--ink)]"
                    aria-label="Plus d'options"
                    aria-expanded={menuOpen}
                  >
                    ⋯
                  </button>
                ) : null}
              </div>
            </div>

            {badges ? <div className="mt-2 flex flex-wrap gap-2">{badges}</div> : null}
          </div>
        </div>

        {children ? <div className="mt-3 min-w-0">{children}</div> : null}

        {footer ? (
          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row">
            {footer}
          </div>
        ) : null}
      </div>

      {hasMenu && menuOpen ? (
        <div
          ref={menuRef}
          className="absolute right-4 top-12 z-20 w-52 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] py-1 shadow-lg"
        >
          {menuItems.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              disabled={item.disabled}
              className={`w-full px-4 py-2 text-left text-sm font-body transition disabled:opacity-50 ${
                item.destructive
                  ? 'text-[#EF4444] hover:bg-[#FEF2F2]'
                  : 'text-[var(--ink)] hover:bg-[var(--surface)]'
              }`}
              onClick={() => {
                setMenuOpen(false)
                item.onClick()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function TemplateCardFooterButton({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  className = '',
  ...props
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  const base =
    'flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-body font-semibold transition disabled:opacity-50 sm:flex-1'
  const styles =
    variant === 'primary'
      ? 'bg-[var(--ink)] text-[var(--white)] hover:bg-[var(--ink-soft)]'
      : 'border border-[var(--border)] bg-[var(--white)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function DefaultBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-[3px] font-display text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
      </span>
      Par défaut
    </span>
  )
}
