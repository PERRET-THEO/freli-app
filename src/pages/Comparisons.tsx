import { Link, useParams } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { SeoHead } from '../components/seo/SeoHead'
import { Button } from '../components/ui'
import {
  comparisonPages,
  getComparisonBySlug,
  type ComparisonPage,
} from '../lib/seo/comparisons'

function ComparisonArticle({ page }: { page: ComparisonPage }) {
  return (
    <>
      <SeoHead path={page.path} title={page.metaTitle} description={page.metaDescription} />
      <h1 className="mt-8 font-display text-4xl font-extrabold tracking-tight">{page.title}</h1>
      <p className="mt-4 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
        {page.intro}
      </p>

      <div className="mt-8 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--ink-soft)]">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm font-body">
          <thead>
            <tr className="border-b border-[var(--ink-soft)] bg-[rgba(255,255,255,0.04)]">
              <th className="px-4 py-3 font-display font-bold text-[var(--white)]">Critère</th>
              <th className="px-4 py-3 font-display font-bold text-[var(--white)]">Freli</th>
              <th className="px-4 py-3 font-display font-bold text-[var(--white)]">
                {page.competitorName}
              </th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.criterion} className="border-b border-[var(--ink-soft)] last:border-0">
                <td className="px-4 py-3 text-[var(--white)]">{row.criterion}</td>
                <td className="px-4 py-3 text-[var(--mint)]">{row.freli}</td>
                <td className="px-4 py-3 text-[var(--surface-warm)]">{row.other}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-sm font-body leading-relaxed text-[var(--surface-warm)]">
        {page.verdict}
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/demo">
          <Button>Demander une démo</Button>
        </Link>
        <Link
          to="/tarifs"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] underline-offset-2 hover:text-[var(--white)] hover:underline"
        >
          Voir les tarifs →
        </Link>
      </div>
    </>
  )
}

export function ComparisonsHub() {
  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <SeoHead
        path="/comparatifs"
        title="Comparatifs Freli — onboarding client"
        description="Comparez Freli à Content Snare, Clustdoc et à la stack emails + Forms + DocuSign pour l’onboarding client des freelances et agences."
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
          Comparatifs Freli
        </h1>
        <p className="mt-4 text-sm font-body text-[var(--surface-warm)]">
          Freli se compare aux outils d&apos;intake / onboarding client métier — pas aux
          plateformes d&apos;adoption produit.
        </p>
        <ul className="mt-8 space-y-3">
          {comparisonPages.map((page) => (
            <li key={page.slug}>
              <Link
                to={page.path}
                className="block rounded-[var(--radius-md)] border border-[var(--ink-soft)] px-4 py-3 text-sm font-body text-[var(--white)] transition hover:border-[var(--accent)]"
              >
                {page.title} →
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

export function ComparisonDetail() {
  const { slug = '' } = useParams()
  const page = getComparisonBySlug(slug)

  if (!page) {
    return (
      <div className="min-h-screen bg-[var(--ink)] px-4 py-12 text-[var(--white)]">
        <Navbar />
        <main className="mx-auto max-w-3xl">
          <p className="mt-12 text-sm font-body">Comparatif introuvable.</p>
          <Link to="/comparatifs" className="mt-4 inline-block text-[var(--accent)] underline">
            Voir tous les comparatifs
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          to="/comparatifs"
          className="inline-flex items-center text-sm font-body text-[var(--surface-warm)] hover:text-[var(--white)]"
        >
          ← Tous les comparatifs
        </Link>
        <ComparisonArticle page={page} />
      </main>
    </div>
  )
}
