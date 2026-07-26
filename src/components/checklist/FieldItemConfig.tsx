import { Input } from '../ui'
import type { DraftChecklistItem } from '../../lib/checklist'
import {
  formatChoiceOptions,
  isValidHttpUrl,
  parseChoiceOptions,
} from '../../lib/checklistFields'
import { isFreliPortalUrl } from '../../lib/scheduleEmbed'

type FieldItemConfigProps = {
  item: DraftChecklistItem
  priceEur: number | null
  onChange: (patch: Partial<DraftChecklistItem>) => void
}

const hintCls = 'mt-1 text-xs font-body text-[var(--ink-muted)]'
const warnCls = 'mt-1 text-xs font-body text-[var(--amber)]'

/** Configuration des étapes non contractuelles qui en demandent une. */
export function FieldItemConfig({ item, priceEur, onChange }: FieldItemConfigProps) {
  if (item.type === 'choice') {
    const options = item.choiceOptions ?? []
    return (
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <label className="text-xs font-body font-medium text-[var(--ink-soft)]">
          Options proposées — une par ligne
        </label>
        <textarea
          rows={3}
          value={formatChoiceOptions(options)}
          onChange={(event) =>
            onChange({ choiceOptions: parseChoiceOptions(event.target.value) })
          }
          placeholder={'Oui\nNon\nÀ définir'}
          className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        {options.filter((option) => option.trim()).length < 2 ? (
          <p className={warnCls}>Ajoute au moins deux options.</p>
        ) : (
          <p className={hintCls}>
            {options.length} option{options.length > 1 ? 's' : ''} — le client en choisit une.
          </p>
        )}
      </div>
    )
  }

  if (item.type === 'schedule') {
    const scheduleUrl = item.scheduleUrl ?? ''
    return (
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <label className="text-xs font-body font-medium text-[var(--ink-soft)]">
          Lien de réservation (Calendly ou Cal.com recommandé)
        </label>
        <Input
          className="mt-1.5"
          value={scheduleUrl}
          placeholder="https://calendly.com/mon-agence/kickoff"
          onChange={(event) => onChange({ scheduleUrl: event.target.value })}
        />
        {scheduleUrl.trim() && !isValidHttpUrl(scheduleUrl) ? (
          <p className={warnCls}>Lien invalide.</p>
        ) : scheduleUrl.trim() && isFreliPortalUrl(scheduleUrl) ? (
          <p className={warnCls}>
            Ceci est le lien du portail Freli. Collez plutôt votre lien Calendly
            (ex. https://calendly.com/votre-nom/kickoff).
          </p>
        ) : (
          <p className={hintCls}>
            Avec Calendly ou Cal.com, le calendrier s&apos;affiche directement dans le
            portail client. Les autres liens s&apos;ouvrent dans un nouvel onglet.
          </p>
        )}
      </div>
    )
  }

  if (item.type === 'payment') {
    return (
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        {priceEur && priceEur > 0 ? (
          <p className={hintCls}>
            Le client règle {priceEur} € à cette étape, via Stripe. Une seule étape de paiement
            par projet.
          </p>
        ) : (
          <p className={warnCls}>
            Renseigne le prix du projet pour utiliser une étape de paiement.
          </p>
        )}
      </div>
    )
  }

  return null
}
