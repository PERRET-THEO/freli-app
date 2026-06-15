import {
  WEBHOOK_SETUP_GUIDE_CATEGORIES,
  WEBHOOK_SETUP_GUIDES,
  type WebhookSetupCategory,
} from '../../lib/integrations/webhooks'

const CATEGORY_ORDER: WebhookSetupCategory[] = [
  'automator',
  'notification',
  'productivity',
  'finance',
]

export function WebhookSetupGuide() {
  return (
    <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3 text-xs font-body text-[var(--ink-muted)]">
      <p className="font-medium text-[var(--ink-soft)]">Comment connecter vos outils</p>
      <div className="mt-2 space-y-1.5">
        {CATEGORY_ORDER.map((category) => {
          const meta = WEBHOOK_SETUP_GUIDE_CATEGORIES[category]
          const guides = WEBHOOK_SETUP_GUIDES.filter((g) => g.category === category)
          if (guides.length === 0) return null

          return (
            <details
              key={category}
              open={category === 'automator'}
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2"
            >
              <summary className="cursor-pointer font-medium text-[var(--ink-soft)]">
                {meta.label}
              </summary>
              <p className="mt-1 text-[var(--ink-muted)]">{meta.description}</p>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-4">
                {guides.map((guide) => (
                  <li key={guide.id}>
                    <strong className="text-[var(--ink-soft)]">{guide.name}</strong> : {guide.summary}
                    {guide.viaAutomator ? (
                      <span className="block text-[var(--ink-muted)]">
                        Via {guide.viaAutomator}. {guide.detail}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          )
        })}
      </div>
      <p className="mt-2.5 text-[var(--ink-muted)]">
        Freli envoie un JSON (<code>event</code>, <code>timestamp</code>, <code>data</code>). Mappez les
        champs dans votre outil (ex. <code>data.project.client_email</code>).
      </p>
    </div>
  )
}
