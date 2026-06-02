import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Button, Card } from '../components/ui'

type TimelineStep = {
  step: string
  title: string
  text: string
  time: string
  icon: string
  mock: string
}

const stats = [
  { icon: '⏱️', value: '−3h', label: 'Gagnées par nouveau client' },
  { icon: '✉️', value: '0', label: 'Relance manuelle à envoyer' },
  { icon: '⚡', value: '2 min', label: 'Pour lancer un onboarding' },
]

const timeSavingSteps: TimelineStep[] = [
  {
    step: '01',
    title: 'Créez le projet',
    text: "Tapez le nom du client, choisissez les documents à collecter. Freli génère automatiquement un portail dédié.",
    time: '30 sec',
    icon: '✨',
    mock: 'Nouveau projet',
  },
  {
    step: '02',
    title: 'Envoyez le lien',
    text: "Plus de chaînes d'emails. Votre client remplit formulaire, fichiers et signature au même endroit.",
    time: '1 clic',
    icon: '🔗',
    mock: 'freli.fr/p/studio-nova',
  },
  {
    step: '03',
    title: 'Laissez Freli opérer',
    text: "Freli surveille, relance automatiquement et vous prévient seulement quand tout est prêt.",
    time: '0 effort',
    icon: '⚙️',
    mock: 'Tout est prêt ✓',
  },
]

const detailedFeatures = [
  {
    title: 'Collecte automatique en un lien',
    tag: '📋 Formulaire intelligent',
    text: "Envoyez un seul lien à votre client. Il remplit le formulaire, uploade ses documents et signe le contrat — sans créer de compte.",
    gain: 'Gain : 45 min par client',
    visual: '✅📄',
  },
  {
    title: 'Signature électronique intégrée',
    tag: '✍️ Signature native',
    text: 'Vos clients signent directement depuis leur téléphone ou ordinateur. Aucun logiciel tiers nécessaire, aucun va-et-vient d\'emails.',
    gain: 'Gain : plus de DocuSign à payer',
    visual: '🖊️',
  },
  {
    title: 'Relances automatiques',
    tag: '🔔 Zéro email manuel',
    text: "Si votre client n'a pas complété son onboarding après 48h, Freli le relance automatiquement. Vous n'avez plus rien à faire.",
    gain: 'Gain : 1h par semaine',
    visual: '⏱️✉️',
  },
  {
    title: 'Tableau de bord en temps réel',
    tag: "📊 Vue d'ensemble instantanée",
    text: "Suivez l'avancement de chaque client en un coup d'œil. Sachez exactement ce qui manque et qui relancer — sans ouvrir 10 onglets.",
    gain: 'Gain : fin du chaos des emails',
    visual: '📈',
  },
]

const comparison = {
  before: {
    title: 'Sans Freli',
    icon: '😮‍💨',
    items: [
      'Vous envoyez 5 emails pour collecter les infos',
      'Vous jonglez avec Google Forms, Drive, DocuSign',
      'Vous relancez manuellement 2 ou 3 fois',
      'Vous perdez 3h par client avant de démarrer',
    ],
  },
  after: {
    title: 'Avec Freli',
    icon: '🚀',
    items: [
      "Vous envoyez 1 seul lien d'onboarding",
      'Tout est centralisé dans un portail unique',
      'Les relances partent automatiquement',
      "Vous démarrez le projet en moins d'1h",
    ],
  },
}

const testimonials = [
  {
    initials: 'SM',
    name: 'Sophie Martin, Agence Web Lumière',
    text: "Avant Freli, je perdais 3h par nouveau client juste pour récupérer les accès et documents. Maintenant c'est automatique.",
    avatarBg: 'bg-[var(--accent)]',
  },
  {
    initials: 'TD',
    name: 'Thomas Dubois, Freelance UX Designer',
    text: "Mes clients sont impressionnés par le portail d'onboarding. Ça donne une image vraiment professionnelle dès le départ.",
    avatarBg: 'bg-[var(--mint)]',
  },
  {
    initials: 'CR',
    name: 'Camille Rousseau, Studio Créatif Pixel',
    text: "La signature électronique intégrée m'a évité d'utiliser 3 outils différents. Tout est dans Freli, et c'est intuitif dès la première utilisation.",
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
            ⏱️ Gagnez 3h par client
          </span>
          <h1 className="mt-6 text-5xl font-display font-extrabold tracking-tighter">
            Onboarder un client ne devrait prendre que <span className="text-[var(--accent)]">2 minutes</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-body leading-relaxed text-[var(--surface-warm)]">
            Freli remplace les emails, les Google Forms et les relances manuelles par un portail unique,
            automatique et intuitif. Vos clients signent et uploadent tout en un clic.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="https://calendly.com/freli/demo" target="_blank" rel="noreferrer">
              <Button>Demander un accès</Button>
            </a>
            <Link to="/signin">
              <Button variant="secondary">Se connecter →</Button>
            </Link>
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-[13px] font-body text-[rgba(253,252,250,0.5)]">
            ✓ Accès sur invitation &nbsp;&nbsp; ✓ Mise en route en 5 min &nbsp;&nbsp; ✓ Aucune formation
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

        <section id="how-it-works" className="mt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-display font-bold uppercase tracking-wide text-[var(--accent)]">
              Comment ça marche
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[var(--white)]">
              3 étapes. Zéro friction.
            </h2>
            <p className="mt-3 text-sm font-body text-[rgba(253,252,250,0.75)]">
              Pensé pour que vous ne passiez jamais plus de 5 minutes dans Freli pour lancer un client.
            </p>
          </div>

          <div className="relative mt-14">
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-[46px] hidden h-[2px] md:block"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, var(--accent) 12%, var(--accent) 88%, transparent 100%)',
                opacity: 0.35,
              }}
            />
            <div className="relative grid gap-6 md:grid-cols-3 md:gap-8">
              {timeSavingSteps.map((s, idx) => (
                <div key={s.step} className="relative flex flex-col items-center md:items-stretch">
                  <div className="relative z-10 mx-auto flex h-[92px] w-[92px] items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[#8B9BFF] shadow-[0_12px_32px_rgba(90,110,255,0.35)] ring-4 ring-[var(--ink)]">
                    <span className="font-display text-4xl">{s.icon}</span>
                    <span className="absolute -right-2 -top-2 rounded-full bg-[var(--white)] px-2 py-[2px] font-display text-[11px] font-extrabold tracking-tight text-[var(--accent)] shadow">
                      {s.step}
                    </span>
                  </div>

                  <div className="mt-5 rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.08)] bg-gradient-to-b from-[rgba(255,255,255,0.04)] to-[rgba(255,255,255,0.02)] p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-[3px] font-display text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]">
                        ⏱ {s.time}
                      </span>
                      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(253,252,250,0.4)]">
                        Étape {idx + 1}/3
                      </span>
                    </div>

                    <h3 className="mt-4 font-display text-xl font-bold tracking-tight text-[var(--white)]">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-[14px] font-body leading-relaxed text-[rgba(253,252,250,0.78)]">
                      {s.text}
                    </p>

                    <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[rgba(0,0,0,0.35)] px-3 py-2 font-mono text-[12px] text-[rgba(253,252,250,0.75)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--mint)]" />
                      <span className="truncate">{s.mock}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-5 py-3 text-center sm:flex-row">
              <span className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[rgba(253,252,250,0.5)]">
                Temps total de votre côté
              </span>
              <span className="font-display text-2xl font-extrabold tracking-tight text-[var(--white)]">
                ≈ 2 min
              </span>
              <span className="font-body text-xs text-[rgba(253,252,250,0.55)]">
                (contre 3h habituellement)
              </span>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--white)]">
              Un tableau de bord qui se lit en un coup d&apos;œil
            </h2>
            <p className="mt-3 text-sm font-body text-[rgba(253,252,250,0.75)]">
              Interface pensée pour aller droit au but — pas de menus cachés, pas d&apos;options inutiles.
            </p>
          </div>

          <div className="relative mt-10">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 rounded-[40px] bg-[radial-gradient(ellipse_at_top,rgba(90,110,255,0.18),transparent_60%)] blur-2xl"
            />

            <div className="relative rounded-[var(--radius-xl)] bg-[var(--ink-soft)] p-3 shadow-[0_40px_100px_rgba(0,0,0,0.55)] ring-1 ring-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-3 border-b border-[rgba(255,255,255,0.06)] px-3 pb-3 pt-1">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                  <div className="h-3 w-3 rounded-full bg-[#28ca42]" />
                </div>
                <div className="ml-2 flex flex-1 items-center gap-2 rounded-full bg-[rgba(0,0,0,0.4)] px-3 py-1.5">
                  <span className="text-[10px] text-[var(--mint)]">🔒</span>
                  <span className="font-body text-[11px] text-[rgba(253,252,250,0.65)]">app.freli.fr/dashboard</span>
                </div>
                <div className="flex items-center gap-3 text-[rgba(253,252,250,0.5)]">
                  <span className="text-xs">⌕</span>
                  <span className="relative text-xs">
                    🔔
                    <span className="absolute -right-1 -top-1 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-3 md:grid-cols-[240px_1fr]">
                <aside className="flex flex-col rounded-[var(--radius-sm)] bg-[var(--ink)] p-3 text-[var(--surface-warm)]">
                  <div className="flex items-center gap-2 px-1 py-1">
                    <div className="h-8 w-8 rounded-lg bg-[var(--accent)] text-center font-display text-sm font-extrabold leading-8 text-[var(--white)]">
                      Fr
                    </div>
                    <span className="font-display text-lg font-bold text-[var(--white)]">Freli</span>
                  </div>

                  <div className="mt-4 space-y-0.5 text-[13px] font-body">
                    {[
                      { icon: '▦', label: 'Dashboard', active: true, count: '' },
                      { icon: '✦', label: 'Nouveau projet', active: false, count: '' },
                      { icon: '❏', label: 'Projets', active: false, count: '3' },
                      { icon: '✉', label: 'Messages', active: false, count: '2' },
                      { icon: '⚙', label: 'Paramètres', active: false, count: '' },
                    ].map((it) => (
                      <div
                        key={it.label}
                        className={`relative flex items-center gap-2 rounded-md px-2.5 py-1.5 ${
                          it.active
                            ? 'bg-[var(--ink-soft)] text-[var(--white)]'
                            : 'text-[rgba(253,252,250,0.55)]'
                        }`}
                      >
                        {it.active && (
                          <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-[var(--accent)]" />
                        )}
                        <span className="w-4 text-center text-[12px]">{it.icon}</span>
                        <span className="flex-1">{it.label}</span>
                        {it.count && (
                          <span className="rounded-full bg-[var(--accent-soft)] px-1.5 text-[10px] font-bold text-[var(--accent)]">
                            {it.count}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center gap-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mint)] font-display text-xs font-bold text-[var(--ink)]">
                      SM
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[12px] font-semibold text-[var(--white)]">Sophie M.</p>
                      <p className="truncate text-[10px] text-[rgba(253,252,250,0.5)]">Agence Lumière</p>
                    </div>
                  </div>
                </aside>

                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-xl font-bold text-[var(--ink)]">
                        Bonjour, Sophie 👋
                      </h3>
                      <p className="text-[12px] font-body text-[var(--ink-muted)]">
                        <span className="font-semibold text-[var(--ink)]">2 projets</span> avancent seuls ce matin.
                      </p>
                    </div>
                    <button className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 font-display text-[12px] font-semibold text-[var(--white)] shadow-[0_4px_12px_rgba(90,110,255,0.35)]">
                      <span>+</span> Nouveau projet
                    </button>
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {[
                      { k: '12', l: 'Clients ce mois', trend: '+3' },
                      { k: '32h', l: 'Temps gagné', trend: '↑' },
                      { k: '94%', l: 'Taux complétion', trend: '' },
                    ].map((s) => (
                      <div key={s.l} className="rounded-[var(--radius-sm)] border border-[rgba(13,15,20,0.06)] bg-[var(--white)] px-3 py-2">
                        <div className="flex items-baseline gap-1">
                          <p className="font-display text-[18px] font-extrabold leading-none text-[var(--ink)]">{s.k}</p>
                          {s.trend && (
                            <span className="font-display text-[10px] font-bold text-[var(--mint)]">{s.trend}</span>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] font-body uppercase tracking-wide text-[var(--ink-muted)]">{s.l}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[var(--radius-sm)] border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--white)] to-[var(--accent-soft)] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] font-display text-xs font-bold text-[var(--white)]">
                          SN
                        </div>
                        <div>
                          <p className="font-display text-[13px] font-bold text-[var(--ink)]">Studio Nova</p>
                          <p className="text-[10px] font-body text-[var(--ink-muted)]">
                            Onboarding · dernière activité il y a 2 min
                          </p>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-display font-bold text-[var(--white)]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--white)]" />
                        EN COURS
                      </span>
                    </div>

                    <div className="mb-3 flex gap-1">
                      {[true, true, true, false, false].map((done, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${done ? 'bg-[var(--accent)]' : 'bg-[rgba(13,15,20,0.1)]'}`}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-5 gap-1 text-[10px] font-display">
                      {[
                        { l: 'Brief', done: true },
                        { l: 'Docs', done: true },
                        { l: 'Signature', done: true },
                        { l: 'Paiement', done: false, current: true },
                        { l: 'Kickoff', done: false },
                      ].map((st) => (
                        <div key={st.l} className="text-center">
                          <div
                            className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                              st.done
                                ? 'bg-[var(--mint)] text-[var(--ink)]'
                                : st.current
                                  ? 'bg-[var(--amber)] text-[var(--ink)]'
                                  : 'bg-[rgba(13,15,20,0.08)] text-[var(--ink-muted)]'
                            }`}
                          >
                            {st.done ? '✓' : st.current ? '⋯' : ''}
                          </div>
                          <p
                            className={`mt-1 truncate ${
                              st.done || st.current ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'
                            }`}
                          >
                            {st.l}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      {
                        name: 'Maison Lune',
                        initials: 'ML',
                        color: 'bg-[var(--mint)]',
                        status: 'Auto-relance envoyée',
                        statusColor: 'text-[var(--accent)]',
                        progress: 25,
                        last: 'il y a 1 min',
                      },
                      {
                        name: 'Atelier K',
                        initials: 'AK',
                        color: 'bg-[var(--amber)]',
                        status: 'Complété ✓',
                        statusColor: 'text-[var(--mint)]',
                        progress: 100,
                        last: 'hier',
                      },
                    ].map((p) => (
                      <div key={p.name} className="rounded-[var(--radius-sm)] border border-[rgba(13,15,20,0.06)] bg-[var(--white)] p-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-lg ${p.color} font-display text-[11px] font-bold text-[var(--ink)]`}
                          >
                            {p.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-[12px] font-bold text-[var(--ink)]">{p.name}</p>
                            <p className={`truncate text-[10px] font-body font-semibold ${p.statusColor}`}>
                              {p.status}
                            </p>
                          </div>
                          <span className="font-display text-[10px] font-bold text-[var(--ink-muted)]">
                            {p.progress}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-[rgba(13,15,20,0.06)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-[10px] font-body text-[var(--ink-muted)]">{p.last}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--accent)]/30 bg-[var(--ink-soft)] px-4 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.4)] backdrop-blur">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm">
                🤖
              </span>
              <div className="text-left">
                <p className="font-display text-[11px] font-bold text-[var(--white)]">
                  Freli a relancé Maison Lune automatiquement
                </p>
                <p className="text-[10px] font-body text-[rgba(253,252,250,0.55)]">
                  Aucune action requise de votre part · il y a 1 min
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--white)]">
              La différence est immédiate
            </h2>
            <p className="mt-3 text-sm font-body text-[rgba(253,252,250,0.75)]">
              Des heures économisées chaque semaine — et une image pro dès le premier contact.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-[var(--radius-xl)] border border-[rgba(255,255,255,0.08)] bg-gradient-to-br from-[rgba(90,110,255,0.08)] via-[rgba(255,255,255,0.02)] to-[rgba(90,110,255,0.06)] p-6 sm:p-8">
            <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
              <div className="text-center md:text-right">
                <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[rgba(253,252,250,0.5)]">
                  Sans Freli
                </p>
                <p className="mt-2 font-display text-[56px] font-extrabold leading-none tracking-tighter text-[rgba(253,252,250,0.35)] line-through decoration-[var(--amber)] decoration-[3px]">
                  3h 17
                </p>
                <p className="mt-2 font-body text-xs text-[rgba(253,252,250,0.55)]">par nouveau client</p>
              </div>

              <div className="flex flex-col items-center">
                <div className="hidden h-16 w-[2px] bg-gradient-to-b from-transparent via-[var(--accent)] to-transparent md:block" />
                <span className="rounded-full border border-[var(--accent)]/50 bg-[var(--accent-soft)] px-4 py-1.5 font-display text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--accent)]">
                  → Vous récupérez
                </span>
                <div className="hidden h-16 w-[2px] bg-gradient-to-b from-transparent via-[var(--accent)] to-transparent md:block" />
              </div>

              <div className="text-center md:text-left">
                <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Avec Freli
                </p>
                <p className="mt-2 font-display text-[72px] font-extrabold leading-none tracking-tighter text-[var(--white)]">
                  4<span className="text-[var(--accent)]"> min</span>
                </p>
                <p className="mt-2 font-body text-xs text-[rgba(253,252,250,0.7)]">par nouveau client</p>
              </div>
            </div>

            <div className="mt-8 rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.25)] p-5 text-center">
              <p className="font-display text-sm font-bold text-[var(--white)]">
                Soit <span className="text-[var(--mint)]">3h 13 min</span> économisées par client.
              </p>
              <p className="mt-1 font-body text-xs text-[rgba(253,252,250,0.6)]">
                Sur 10 clients/mois, ça fait <span className="font-semibold text-[var(--white)]">&gt; 32 heures</span> récupérées — l&apos;équivalent d&apos;une semaine de travail.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.25)] p-5 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{comparison.before.icon}</span>
                  <h3 className="font-display text-lg font-bold text-[var(--white)]">
                    {comparison.before.title}
                  </h3>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {comparison.before.items.map((it) => (
                    <li
                      key={it}
                      className="flex items-start gap-2 text-[13px] font-body leading-relaxed text-[rgba(253,252,250,0.85)]"
                    >
                      <span className="mt-[1px] flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[var(--amber)]/20 text-[10px] font-bold text-[var(--amber)]">
                        ✗
                      </span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--accent)]/40 bg-gradient-to-br from-[rgba(90,110,255,0.18)] to-[rgba(0,0,0,0.35)] p-5 text-left shadow-[0_8px_32px_rgba(90,110,255,0.15)]">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{comparison.after.icon}</span>
                  <h3 className="font-display text-lg font-bold text-[var(--white)]">
                    {comparison.after.title}
                  </h3>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {comparison.after.items.map((it) => (
                    <li
                      key={it}
                      className="flex items-start gap-2 text-[13px] font-body leading-relaxed text-[var(--white)]"
                    >
                      <span className="mt-[1px] flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[var(--mint)]/25 text-[10px] font-bold text-[var(--mint)]">
                        ✓
                      </span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mt-16 rounded-[var(--radius-xl)] bg-[var(--surface)] px-4 py-10 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">
              Chaque fonctionnalité vous fait gagner du temps
            </h2>
            <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
              Un flux simple de bout en bout — de l&apos;invitation client à la signature.
            </p>
          </div>
          <div className="mt-10 space-y-8">
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
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--mint)]/20 px-3 py-1 text-xs font-display font-bold text-[var(--ink)]">
                    ⏱️ {feature.gain}
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
              <div
                key={item.name}
                className="rounded-[var(--radius-lg)] border border-[rgba(255,255,255,0.06)] bg-[var(--ink)] p-7 text-left shadow-[0_2px_16px_rgba(0,0,0,0.25)]"
              >
                <p className="font-display text-[64px] leading-none text-[var(--accent-soft)]">&ldquo;</p>
                <p className="-mt-2 text-sm font-body leading-relaxed text-[rgba(253,252,250,0.85)]">
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
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[var(--radius-xl)] bg-gradient-to-r from-[var(--accent)] to-[#8B9BFF] px-4 py-12 text-center sm:px-8">
          <h2 className="font-display text-4xl font-extrabold tracking-tight text-[var(--white)]">
            Arrêtez de perdre 3h par client.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-body text-[rgba(255,255,255,0.85)]">
            Rejoignez les freelances et agences qui automatisent leur onboarding avec Freli.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="https://calendly.com/freli/demo" target="_blank" rel="noreferrer">
              <button className="rounded-[var(--radius-sm)] bg-[var(--white)] px-6 py-3 text-sm font-body font-medium text-[var(--accent)]">
                Demander un accès
              </button>
            </a>
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
            ✓ Accompagnement personnalisé &nbsp;&nbsp; ✓ Prise en main en 5 minutes
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
            <a href="#how-it-works">Comment ça marche</a>
            <a href="https://calendly.com/freli/demo" target="_blank" rel="noreferrer">
              Réserver une démo
            </a>
            <Link to="/signin">Se connecter</Link>
          </div>
          <p className="text-sm font-body text-[var(--ink-muted)]">© 2025 Freli</p>
        </div>
      </footer>
    </div>
  )
}
