import { formatPersonInitials } from '../../lib/formatPersonName'

const AVATAR_PALETTE = [
  'bg-[var(--accent)]',
  'bg-[var(--mint)]',
  'bg-[var(--amber)]',
  'bg-[#F472B6]',
  'bg-[#60A5FA]',
  'bg-[#A78BFA]',
] as const

export function avatarColorFromSeed(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

type PersonAvatarProps = {
  seed: string
  firstName?: string
  lastName?: string
  /** Full display name fallback when first/last are unavailable. */
  name?: string
  size?: 'sm' | 'md' | 'lg'
  shape?: 'circle' | 'rounded'
  className?: string
}

const sizeClass = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
} as const

const shapeClass = {
  circle: 'rounded-full',
  rounded: 'rounded-xl',
} as const

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function PersonAvatar({
  seed,
  firstName,
  lastName,
  name,
  size = 'sm',
  shape = 'circle',
  className = '',
}: PersonAvatarProps) {
  const initials =
    firstName !== undefined || lastName !== undefined
      ? formatPersonInitials(firstName ?? '', lastName ?? '')
      : initialsFromName(name ?? '')

  return (
    <div
      className={`flex shrink-0 items-center justify-center font-display font-bold text-[var(--white)] ${sizeClass[size]} ${shapeClass[shape]} ${avatarColorFromSeed(seed)} ${className}`}
      aria-hidden
    >
      {initials}
    </div>
  )
}
