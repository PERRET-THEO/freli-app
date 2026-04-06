import type { HTMLAttributes } from 'react'

type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-[var(--white)] rounded-[var(--radius-lg)] p-7 shadow-[0_2px_16px_rgba(13,15,20,0.06),0_0_0_1px_rgba(13,15,20,0.04)] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
