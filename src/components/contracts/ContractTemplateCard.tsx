import {
  DefaultBadge,
  TemplateCardFooterButton,
  TemplateItemCard,
} from '../templates'

export type ContractTemplate = {
  id: string
  name: string
  pdf_url: string | null
  is_default: boolean
  created_at: string
  signature_page: number
  signature_x: number
  signature_y: number
  signature_width: number
  signature_height: number
}

type ContractTemplateCardProps = {
  template: ContractTemplate
  isPositioned: boolean
  deleting: boolean
  onOpenPdf: (pdfUrl: string) => void
  onEditPosition: (template: ContractTemplate) => void
  onSetDefault: (id: string) => void
  onRemove: (template: ContractTemplate) => void
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export function ContractTemplateCard({
  template,
  isPositioned,
  deleting,
  onOpenPdf,
  onEditPosition,
  onSetDefault,
  onRemove,
}: ContractTemplateCardProps) {
  const icon = template.pdf_url ? (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] font-display text-xs font-extrabold text-[var(--accent)]">
      PDF
    </div>
  ) : (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-warm)] font-display text-sm font-extrabold text-[var(--ink-muted)]">
      {getInitials(template.name)}
    </div>
  )

  const badges = (
    <>
      {template.pdf_url ? (
        <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
          PDF chargé
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-[var(--surface-warm)] px-2.5 py-0.5 text-xs font-body text-[var(--ink-muted)]">
          Pas de PDF
        </span>
      )}
      {template.pdf_url ? (
        isPositioned ? (
          <span className="inline-flex items-center rounded-full bg-[var(--mint-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--mint)]">
            Signature positionnée
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--amber)]">
            Position par défaut
          </span>
        )
      ) : null}
    </>
  )

  const menuItems = [
    ...(template.is_default
      ? []
      : [{ label: 'Définir par défaut', onClick: () => onSetDefault(template.id) }]),
    {
      label: deleting ? 'Suppression…' : 'Supprimer',
      onClick: () => onRemove(template),
      destructive: true,
      disabled: deleting,
    },
  ]

  const footer = (
    <>
      {template.pdf_url ? (
        <>
          <TemplateCardFooterButton variant="primary" onClick={() => onOpenPdf(template.pdf_url!)}>
            Voir le PDF →
          </TemplateCardFooterButton>
          <TemplateCardFooterButton onClick={() => onEditPosition(template)}>
            Modifier la position
          </TemplateCardFooterButton>
        </>
      ) : (
        <TemplateCardFooterButton onClick={() => onSetDefault(template.id)}>
          Définir par défaut
        </TemplateCardFooterButton>
      )}
    </>
  )

  return (
    <TemplateItemCard
      highlighted={template.is_default}
      icon={icon}
      title={template.name}
      meta={`Créé le ${new Date(template.created_at).toLocaleDateString('fr-FR')}`}
      headerBadge={template.is_default ? <DefaultBadge /> : undefined}
      badges={badges}
      footer={footer}
      menuItems={menuItems}
    />
  )
}
