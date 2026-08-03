import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

const SECTIONS = [
  { id: 'settings-organisation', label: 'Organisation', shortLabel: 'Organisation' },
  { id: 'settings-equipe', label: 'Équipe', shortLabel: 'Équipe' },
  { id: 'settings-legal', label: 'Informations légales', shortLabel: 'Légal' },
  { id: 'settings-portail', label: 'Portail client', shortLabel: 'Portail' },
  { id: 'settings-relances', label: 'Relances', shortLabel: 'Relances' },
  { id: 'settings-ia', label: 'IA', shortLabel: 'IA' },
  { id: 'settings-abonnement', label: 'Abonnement', shortLabel: 'Abonnement' },
  { id: 'settings-compte', label: 'Compte', shortLabel: 'Compte' },
  { id: 'settings-aide', label: 'Aide', shortLabel: 'Aide' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

type SettingsNavProps = {
  /** Override optionnel ; sinon scroll-spy interne. */
  activeId?: string
}

export function SettingsNav({ activeId: activeIdProp }: SettingsNavProps) {
  const reduceMotion = useReducedMotion()
  const [spyId, setSpyId] = useState<SectionId>(SECTIONS[0].id)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const activeId = (activeIdProp as SectionId | undefined) ?? spyId

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const updateScrollFades = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollFades()
    el.addEventListener('scroll', updateScrollFades, { passive: true })
    const ro = new ResizeObserver(updateScrollFades)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateScrollFades)
      ro.disconnect()
    }
  }, [updateScrollFades])

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    )
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const top = visible[0]
        if (top?.target?.id) {
          setSpyId(top.target.id as SectionId)
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0,
      },
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const btn = tabRefs.current.get(activeId)
    btn?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeId, reduceMotion])

  const maskImage =
    canScrollLeft && canScrollRight
      ? 'linear-gradient(90deg, transparent, #000 12px, #000 calc(100% - 12px), transparent)'
      : canScrollLeft
        ? 'linear-gradient(90deg, transparent, #000 12px, #000 100%)'
        : canScrollRight
          ? 'linear-gradient(90deg, #000 0%, #000 calc(100% - 12px), transparent)'
          : undefined

  return (
    <>
      <nav className="sticky top-4 hidden space-y-1 lg:block" aria-label="Sections paramètres">
        <p className="mb-2 px-3 text-[10px] font-display font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          Sections
        </p>
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollTo(section.id)}
            aria-current={activeId === section.id ? 'true' : undefined}
            className={`block w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm font-body transition ${
              activeId === section.id
                ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                : 'text-[var(--ink-soft)] hover:bg-[var(--surface-warm)] hover:text-[var(--ink)]'
            }`}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div
        className="sticky top-0 z-10 -mx-1 border-b border-[var(--border)] bg-[var(--surface)] lg:hidden"
        style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      >
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label="Sections paramètres"
          className="flex gap-1 overflow-x-auto px-1 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((section) => {
            const isActive = activeId === section.id
            return (
              <button
                key={section.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(section.id, node)
                  else tabRefs.current.delete(section.id)
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => scrollTo(section.id)}
                className={`relative shrink-0 px-3 pb-2.5 pt-2 text-sm font-body transition ${
                  isActive
                    ? 'font-medium text-[var(--ink)]'
                    : 'font-normal text-[var(--ink-muted)] hover:text-[var(--ink-soft)]'
                }`}
                style={{ minHeight: 44 }}
              >
                {section.shortLabel}
                {isActive ? (
                  <motion.span
                    layoutId="settings-mobile-tab"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 32 }
                    }
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
