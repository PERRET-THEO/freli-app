import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { FeatureVisual } from '../landing/FeatureVisuals'
import { marketingHomeUrl } from '../../lib/appUrl'
import { siteConfig } from '../../lib/seo/siteConfig'

type AuthShellProps = {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

function BrandMark() {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] font-display text-sm font-extrabold tracking-tight text-[var(--white)]">
        Fr
      </span>
      <span className="font-display text-2xl font-extrabold tracking-tighter text-[var(--ink)]">
        Freli
      </span>
    </span>
  )
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const reduceMotion = useReducedMotion()
  const homeUrl = marketingHomeUrl()

  return (
    <div className="flex min-h-dvh bg-[var(--surface)]">
      <div className="flex w-full flex-col lg:w-[48%] lg:max-w-xl xl:max-w-2xl">
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <a href={homeUrl} className="shrink-0 transition hover:opacity-90" aria-label="Freli — Accueil">
            <BrandMark />
          </a>
          <a
            href={homeUrl}
            className="text-sm font-body text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          >
            ← Retour à l&apos;accueil
          </a>
        </header>

        <div className="flex flex-1 flex-col justify-center px-5 pb-10 pt-4 sm:px-8 sm:pb-16">
          <div className="mx-auto w-full max-w-md">
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm font-body leading-relaxed text-[var(--ink-muted)]">
                {subtitle}
              </p>
            ) : null}

            <div className="mt-6">{children}</div>

            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        </div>
      </div>

      <aside
        className="relative hidden flex-1 overflow-hidden bg-[var(--ink)] lg:flex lg:flex-col lg:justify-center"
        aria-hidden
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 70% 20%, rgba(91,110,245,0.28), transparent 55%), radial-gradient(ellipse 60% 50% at 20% 80%, rgba(45,212,160,0.12), transparent 50%)',
          }}
        />
        <motion.div
          className="relative z-[1] px-10 py-12 xl:px-16"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-display text-4xl font-extrabold tracking-tighter text-[var(--white)] xl:text-5xl">
            Freli
          </p>
          <p className="mt-3 max-w-sm text-base font-body leading-relaxed text-[var(--surface-warm)]">
            {siteConfig.tagline}. Un portail, des relances automatiques, zéro chase email.
          </p>
          <div className="mt-10 max-w-sm">
            <FeatureVisual id="portal-checklist" />
          </div>
        </motion.div>
      </aside>
    </div>
  )
}
