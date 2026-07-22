import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const EASE = [0.22, 1, 0.36, 1] as const
const DURATION = 0.35

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  /** When true, animate on mount instead of whileInView (hero). */
  immediate?: boolean
  y?: number
}

export function Reveal({
  children,
  className,
  delay = 0,
  immediate = false,
  y = 16,
}: RevealProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  const visible = { opacity: 1, y: 0 }
  const hidden = { opacity: 0, y }

  if (immediate) {
    return (
      <motion.div
        className={className}
        initial={hidden}
        animate={visible}
        transition={{ duration: DURATION, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={visible}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: DURATION, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

type RevealStaggerProps = {
  children: ReactNode
  className?: string
  stagger?: number
}

/** Parent for staggered children — wrap each child in RevealStaggerItem. */
export function RevealStagger({ children, className, stagger = 0.07 }: RevealStaggerProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: stagger },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

export function RevealStaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: DURATION, ease: EASE },
        },
      }}
    >
      {children}
    </motion.div>
  )
}
