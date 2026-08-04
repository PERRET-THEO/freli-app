import type { HTMLAttributes } from 'react'

type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`min-w-0 rounded-[var(--radius-lg)] bg-[var(--white)] p-4 shadow-[0_2px_16px_rgba(13,15,20,0.06),0_0_0_1px_rgba(13,15,20,0.04)] sm:p-7 ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
