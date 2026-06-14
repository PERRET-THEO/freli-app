import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SUPPORT_EMAIL } from '../../lib/support'
import { Navbar } from './Navbar'

type LegalPageLayoutProps = {
  title: string
  lastUpdated: string
  children: ReactNode
}

export function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] hover:text-[var(--white)]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <article className="mt-8">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
            Dernière mise à jour : {lastUpdated}
          </p>
          <div className="prose-legal mt-10 space-y-6 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
            {children}
          </div>
        </article>
      </main>

      <footer className="border-t border-[var(--ink-soft)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm font-body text-[var(--ink-muted)]">© 2026 Freli</p>
          <div className="flex flex-wrap gap-5 text-sm font-body text-[var(--surface-warm)]">
            <Link to="/confidentialite" className="hover:text-[var(--white)]">
              Politique de confidentialité
            </Link>
            <Link to="/conditions-utilisation" className="hover:text-[var(--white)]">
              Conditions d&apos;utilisation
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-[var(--white)]">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-bold text-[var(--white)]">{title}</h2>
      {children}
    </section>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <Section title={title}>{children}</Section>
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
