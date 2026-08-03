import {
  normalizePortfolioUrl,
  resolvePortfolioLabel,
} from '../../lib/portfolioUrl'

type PortalPortfolioLinkProps = {
  url?: string | null
  label?: string | null
  className?: string
  variant?: 'button' | 'text'
}

export function PortalPortfolioLink({
  url,
  label,
  className = '',
  variant = 'button',
}: PortalPortfolioLinkProps) {
  const href = normalizePortfolioUrl(url)
  if (!href) return null

  const text = resolvePortfolioLabel(label)

  if (variant === 'text') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={text}
        className={`inline-flex min-h-11 items-center justify-center px-3 font-body text-xs text-[var(--ink-muted)] underline-offset-2 transition hover:text-[var(--portal-accent,var(--accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-accent,var(--accent))] ${className}`.trim()}
      >
        {text}
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={text}
      className={`inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--portal-accent-border,var(--border))] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--portal-accent,var(--accent))] hover:text-[var(--portal-accent,var(--accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--portal-accent,var(--accent))] ${className}`.trim()}
    >
      {text}
    </a>
  )
}
