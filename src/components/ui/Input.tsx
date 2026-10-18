import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid = false, ...props },
  ref,
) {
  const borderCls = invalid
    ? 'border-[var(--amber)] focus:border-[var(--amber)] focus:ring-[var(--amber)]/30'
    : 'border-[var(--border)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]'
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-[var(--radius-sm)] border bg-[var(--white)] px-4 py-3 font-body text-base text-[var(--ink)] placeholder-[var(--ink-muted)] transition-all focus:outline-none focus:ring-2 ${borderCls} ${className}`}
      {...props}
    />
  )
})
