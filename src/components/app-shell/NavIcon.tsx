import type { LucideIcon } from 'lucide-react'

type NavIconProps = {
  icon: LucideIcon
  active?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const sizePx = { sm: 18, md: 20 } as const

export function NavIcon({ icon: Icon, active = false, size = 'md', className = '' }: NavIconProps) {
  return (
    <Icon
      size={sizePx[size]}
      strokeWidth={active ? 2 : 1.75}
      absoluteStrokeWidth
      aria-hidden
      className={`shrink-0 ${className}`}
    />
  )
}
