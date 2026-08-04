import { Link } from 'react-router-dom'
import { Button } from '../ui'
import { FRELI_AI_ADDON } from '../../lib/billing/entitlements'

export type AiModuleFlags = {
  extraction: boolean
  reminders: boolean
  contracts: boolean
}

type AiModulesPanelProps = {
  agencyId: string | null
  flags: AiModuleFlags
  onFlagsChange: (flags: AiModuleFlags) => void
  onSave: () => void
  saving: boolean
  feedback: { type: 'success' | 'error'; text: string } | null
  aiAddonActive: boolean
  creditsBalance: number | null
  creditsLoading?: boolean
}

const MODULES: Array<{
  key: keyof AiModuleFlags
  title: string
  description: string
}> = [
  {
    key: 'extraction',
    title: 'Extraction de documents',
    description:
      'Les documents uploadés par vos clients (pièce d’identité, Kbis, RIB) sont analysés et les champs extraits vous sont proposés pour validation. Rien n’est écrit sans votre accord.',
  },
  {
    key: 'reminders',
    title: 'Relances intelligentes',
    description:
      'Le contenu des relances s’adapte au comportement email du client (non ouvert, ouvert sans clic, étape bloquante — signaux Resend + portail Freli). Le déclenchement reste basé sur vos règles.',
  },
  {
    key: 'contracts',
    title: 'Génération de contrats',
    description:
      'Décrivez un projet en langage naturel et obtenez une première version éditable. Les clauses de votre bibliothèque et modèles sont privilégiées ; le reste reste marqué pour revue juridique.',
  },
]

export function AiModulesPanel({
  agencyId,
  flags,
  onFlagsChange,
  onSave,
  saving,
  feedback,
  aiAddonActive,
  creditsBalance,
  creditsLoading,
}: AiModulesPanelProps) {
  const locked = !aiAddonActive

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
        <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
        <p className="mt-1.5 text-xs font-body leading-relaxed text-[var(--ink-muted)]">
          Chaque module est indépendant et activable séparément. Les traitements IA s’exécutent côté
          serveur. Extraction et contrats exigent toujours une validation humaine avant écriture ou
          envoi client. Pour les relances, le premier envoi d’un projet reste en brouillon à
          valider ; l’envoi auto (si activé) ne s’applique qu’aux relances suivantes. Add-on :{' '}
          {FRELI_AI_ADDON.monthlyLabelHt} / mois ({FRELI_AI_ADDON.includedCreditsPerMonth} crédits).
        </p>
      </div>

      {locked ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--amber)]/40 bg-[var(--amber)]/10 p-4">
          <p className="text-sm font-body font-medium text-[var(--ink)]">
            Modules IA verrouillés — add-on non actif
          </p>
          <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
            Souscrivez l’add-on Modules IA pour activer l’extraction, les relances intelligentes et
            la génération de contrats.
          </p>
          <Link
            to="/tarifs"
            className="mt-3 inline-flex text-sm font-body font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Voir les tarifs
          </Link>
        </div>
      ) : (
        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3">
          <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Crédits ce mois</p>
          <p className="mt-0.5 text-sm font-body text-[var(--ink)]">
            {creditsLoading
              ? 'Chargement…'
              : creditsBalance == null
                ? '—'
                : `${creditsBalance} / ${FRELI_AI_ADDON.includedCreditsPerMonth} crédits restants`}
          </p>
          <p className="mt-1 text-xs font-body text-[var(--ink-muted)]">
            1 crédit = 1 extraction, 1 relance générée ou 1 génération / analyse de contrat.
          </p>
        </div>
      )}

      {MODULES.map((module) => {
        const checked = flags[module.key]
        return (
          <label
            key={module.key}
            className={`flex items-start gap-3 rounded-[var(--radius-sm)] border p-4 transition ${
              checked
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--border)] bg-[var(--white)]'
            } ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={locked}
              onChange={(e) => onFlagsChange({ ...flags, [module.key]: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-body font-medium text-[var(--ink)]">
                {module.title}
              </span>
              <span className="mt-0.5 block text-xs font-body text-[var(--ink-muted)]">
                {module.description}
              </span>
            </span>
          </label>
        )
      })}

      <Button onClick={onSave} disabled={saving || !agencyId || locked}>
        {saving ? 'Enregistrement…' : 'Enregistrer les modules IA'}
      </Button>

      {feedback ? (
        <p
          className={`text-sm font-body ${
            feedback.type === 'success' ? 'text-[var(--mint)]' : 'text-[var(--amber)]'
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
