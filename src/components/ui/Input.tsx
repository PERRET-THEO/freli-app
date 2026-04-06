import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`w-full bg-[var(--white)] border border-[var(--border)] rounded-[var(--radius-sm)] px-4 py-3 font-body text-sm text-[var(--ink)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] transition-all ${className}`}
      {...props}
    />
  )
}
