import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--white)] shadow-[0_4px_14px_rgba(91,110,245,0.35)] hover:brightness-95 hover:-translate-y-0.5',
  secondary:
    'bg-[var(--white)] text-[var(--ink)] border border-[var(--border)] hover:border-[var(--accent)]',
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center px-6 py-3 rounded-[var(--radius-sm)] font-body font-medium text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
