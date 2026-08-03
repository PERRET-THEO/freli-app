import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { SeoHead } from '../components/seo/SeoHead'
import { answerBlocks } from '../lib/seo/answerBlocks'
import { faqEntries } from '../lib/seo/faqContent'
import { breadcrumbJsonLd, faqPageJsonLd, jsonLdGraph } from '../lib/seo/jsonLd'

export function Faq() {
  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <SeoHead
        path="/faq"
        jsonLd={jsonLdGraph(
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'FAQ', path: '/faq' },
          ]),
          faqPageJsonLd(faqEntries),
        )}
      />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] hover:text-[var(--white)]"
        >
          ← Retour à l&apos;accueil
        </Link>

        <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">
          Questions fréquentes
        </h1>
        <p className="mt-3 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          {answerBlocks.faq}
        </p>
        <p className="mt-3 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
          Une autre question ?{' '}
          <Link to="/demo" className="text-[var(--accent)] hover:underline">
            Réservez une démo
          </Link>
          .
        </p>

        <div className="mt-10 space-y-4">
          {faqEntries.map((entry) => (
            <details
              key={entry.question}
              className="group rounded-[var(--radius-md)] border border-[var(--ink-soft)] bg-[rgba(255,255,255,0.02)] px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-display text-base font-bold text-[var(--white)] marker:content-none">
                <span className="mr-2 inline-block text-[var(--accent)] transition-transform group-open:rotate-90">
                  ›
                </span>
                {entry.question}
              </summary>
              <p className="mt-3 pl-5 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
                {entry.answer}
              </p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-[var(--radius-md)] border border-[var(--ink-soft)] p-6 text-center">
          <p className="font-display text-lg font-bold">Prêt à voir Freli en action ?</p>
          <Link
            to="/demo"
            className="mt-4 inline-block rounded-[var(--radius-sm)] bg-[var(--accent)] px-6 py-3 text-sm font-body font-medium text-[var(--white)] transition-transform duration-200 hover:scale-[1.02]"
          >
            Réserver une démo
          </Link>
        </div>
      </main>
    </div>
  )
}
