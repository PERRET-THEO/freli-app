import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Button, Card } from '../components/ui'

const stats = [
  { icon: '⚡', value: '3×', label: 'Plus rapide' },
  { icon: '✉️', value: '0', label: 'Email de relance manuel' },
  { icon: '🎨', value: '100%', label: 'À votre image' },
]

const detailedFeatures = [
  {
    title: 'Collecte automatique en un lien',
    tag: '📋 Formulaire intelligent',
    text: "Envoyez un seul lien à votre client. Il remplit le formulaire, uploade ses documents et signe le contrat — sans créer de compte.",
    visual: '✅📄',
  },
  {
    title: 'Signature électronique intégrée',
    tag: '✍️ Signature native',
    text: 'Vos clients signent directement depuis leur téléphone ou ordinateur. Aucun logiciel tiers nécessaire.',
    visual: '🖊️',
  },
  {
    title: 'Relances automatiques',
    tag: '🔔 Zéro email manuel',
    text: "Si votre client n'a pas complété son onboarding après 48h, Freli le relance automatiquement. Vous n'avez plus rien à faire.",
    visual: '⏱️✉️',
  },
  {
    title: 'Tableau de bord en temps réel',
    tag: "📊 Vue d'ensemble instantanée",
    text: "Suivez l'avancement de chaque client en un coup d'œil. Sachez exactement ce qui manque et qui relancer.",
    visual: '📈',
  },
]

const testimonials = [
  {
    initials: 'SM',
    name: 'Sophie Martin, Agence Web Lumière',
    text: 'Avant Freli, je perdais 3h par nouveau client juste pour récupérer les accès et documents. Maintenant c’est automatique.',
    avatarBg: 'bg-[var(--accent)]',
  },
  {
    initials: 'TD',
    name: 'Thomas Dubois, Freelance UX Designer',
    text: 'Mes clients sont impressionnés par le portail d’onboarding. Ça donne une image vraiment professionnelle dès le départ.',
    avatarBg: 'bg-[var(--mint)]',
  },
  {
    initials: 'CR',
    name: 'Camille Rousseau, Studio Créatif Pixel',
    text: 'La signature électronique intégrée m’a évité d’utiliser 3 outils différents. Tout est dans Freli.',
    avatarBg: 'bg-[var(--amber)]',
  },
]

export function Landing() {
  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--white)]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
            ✦ Nouveau
          </span>
          <h1 className="mt-6 text-5xl font-display font-extrabold tracking-tighter">
            Automatise ton onboarding client avec Freli
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-body leading-relaxed text-[var(--surface-warm)]">
            Un portail élégant pour collecter formulaires, fichiers et signatures sans
            friction.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/auth">
              <Button>Démarrer l&apos;essai gratuit — 5 jours</Button>
            </Link>
            <a href="https://calendly.com/freli/demo" target="_blank" rel="noreferrer">
              <Button variant="secondary">Réserver une démo →</Button>
            </a>
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-[13px] font-body text-[rgba(253,252,250,0.5)]">
            ✓ Aucune carte bancaire requise &nbsp;&nbsp; ✓ 5 jours d&apos;accès complet
            &nbsp;&nbsp; ✓ Accompagnement personnalisé
          </p>
        </div>

        <section className="mt-14 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="bg-[var(--white)] p-6 text-center">
              <p className="text-2xl">{stat.icon}</p>
              <p className="text-[36px] font-display font-extrabold leading-none tracking-tight text-[var(--ink)]">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                {stat.label}
              </p>
            </Card>
          ))}
        </section>

        <section className="mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--white)]">
              Tout ce dont vous avez besoin, sans la complexité
            </h2>
            <p className="mt-3 text-sm font-body text-[var(--surface-warm)]">
              Un flux simple de bout en bout — de l&apos;invitation client à la signature.
            </p>
          </div>

          <div className="mt-8 rounded-[var(--radius-xl)] bg-[var(--ink-soft)] p-4 shadow-[0_32px_80px_rgba(0,0,0,0.4)] transform-[perspective(1000px)_rotateX(3deg)]">
            <div className="mb-4 flex items-center gap-3 border-b border-[var(--ink)]/40 pb-3">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28ca42]" />
              <div className="ml-3 rounded-full bg-[var(--ink)] px-4 py-1 text-xs font-body text-[var(--surface-warm)]">
                app.freli.fr
              </div>
            </div>
            <div className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-4 md:grid-cols-[220px_1fr]">
              <aside className="rounded-[var(--radius-sm)] bg-[var(--ink)] p-4 text-[var(--surface-warm)]">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-[var(--accent)] text-center font-display text-sm font-extrabold leading-8 text-[var(--white)]">
                    Fr
                  </div>
                  <span className="font-display text-lg font-bold text-[var(--white)]">Freli</span>
                </div>
                <div className="mt-4 space-y-2 text-sm font-body">
                  <p className="rounded bg-[var(--ink-soft)] px-3 py-2 text-[var(--white)]">Dashboard</p>
                  <p className="px-3 py-2">Nouveau projet</p>
                  <p className="px-3 py-2">Paramètres</p>
                </div>
              </aside>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold text-[var(--ink)]">
                    Bonjour, Sophie 👋
                  </h3>
                  <Button className="px-4 py-2 text-xs">Nouveau projet</Button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    ['Studio Nova', 'En cours', '60%'],
                    ['Maison Lune', 'En attente', '25%'],
                    ['Atelier K', 'Complété', '100%'],
                  ].map(([name, status, progress]) => (
                    <div key={name} className="rounded-[var(--radius-sm)] bg-[var(--white)] p-3">
                      <p className="font-display text-sm font-bold text-[var(--ink)]">{name}</p>
                      <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">{status}</p>
                      <div className="mt-3 h-2 rounded-full bg-[var(--surface-warm)]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: progress }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-16 rounded-[var(--radius-xl)] bg-[var(--surface)] px-4 py-10 sm:px-8">
          <div className="space-y-8">
            {detailedFeatures.map((feature, index) => (
              <div
                key={feature.title}
                className={`grid items-center gap-5 md:grid-cols-2 ${
                  index % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''
                }`}
              >
                <div className="flex h-44 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-soft)] text-[80px]">
                  {feature.visual}
                </div>
                <div>
                  <p className="inline-flex rounded-full bg-[var(--white)] px-3 py-1 text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
                    {feature.tag}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-bold text-[var(--ink)]">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm font-body leading-relaxed text-[var(--ink-muted)]">
                    {feature.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[var(--radius-xl)] bg-[var(--ink-soft)] px-4 py-10 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--white)]">
              Ils ont simplifié leur onboarding
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {testimonials.map((item) => (
              <Card key={item.name} className="bg-[var(--ink)] text-left">
                <p className="font-display text-[64px] leading-none text-[var(--accent-soft)]">“</p>
                <p className="-mt-2 text-sm font-body leading-relaxed text-[rgba(253,252,250,0.8)]">
                  {item.text}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${item.avatarBg} font-display text-sm font-bold text-[var(--white)]`}
                  >
                    {item.initials}
                  </div>
                  <p className="text-sm font-display font-semibold text-[var(--white)]">{item.name}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[var(--radius-xl)] bg-gradient-to-r from-[var(--accent)] to-[#8B9BFF] px-4 py-12 text-center sm:px-8">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-[var(--white)]">
            Prêt à transformer votre onboarding ?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-body text-[rgba(255,255,255,0.85)]">
            Rejoignez les agences qui gagnent 3h par client.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/auth">
              <button className="rounded-[var(--radius-sm)] bg-[var(--white)] px-6 py-3 text-sm font-body font-medium text-[var(--accent)]">
                Démarrer gratuitement — 5 jours
              </button>
            </Link>
            <a
              href="https://calendly.com/freli/demo"
              target="_blank"
              rel="noreferrer"
              className="rounded-[var(--radius-sm)] border border-[var(--white)] px-6 py-3 text-sm font-body font-medium text-[var(--white)]"
            >
              Réserver une démo
            </a>
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-[13px] font-body text-[rgba(253,252,250,0.75)]">
            ✓ Aucune carte bancaire requise &nbsp;&nbsp; ✓ 5 jours d&apos;accès complet
            &nbsp;&nbsp; ✓ Accompagnement personnalisé
          </p>
        </section>
      </main>

      <footer className="border-t border-[var(--ink-soft)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[var(--accent)] rounded-xl flex items-center justify-center font-display font-extrabold text-[var(--white)] text-sm tracking-tight">
              Fr
            </div>
            <span className="font-display font-extrabold text-2xl tracking-tighter text-[var(--white)]">
              Freli
            </span>
          </div>
          <div className="flex gap-5 text-sm font-body text-[var(--surface-warm)]">
            <a href="#features">Fonctionnalités</a>
            <a href="https://calendly.com/freli/demo" target="_blank" rel="noreferrer">
              Réserver une démo
            </a>
            <Link to="/auth">Essai gratuit 5 jours</Link>
          </div>
          <p className="text-sm font-body text-[var(--ink-muted)]">© 2025 Freli</p>
        </div>
      </footer>
    </div>
  )
}
