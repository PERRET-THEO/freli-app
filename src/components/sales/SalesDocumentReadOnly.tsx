import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  clientDisplayName,
  formatDateFr,
  formatMoney,
  formatQuantity,
  formatVatRate,
  lineTotalHt,
  type PartySnapshot,
  type SalesDocument,
  type SalesDocumentLine,
} from '../../lib/salesDocuments'

type Props = {
  document: SalesDocument
  lines: SalesDocumentLine[]
  projectName: string | null
  sourceNumber: string | null
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-body font-medium text-[var(--ink-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-body text-[var(--ink)]">{children}</dd>
    </div>
  )
}

function partyAddress(p: PartySnapshot | null): string | null {
  if (!p) return null
  const city = [p.address_postal_code, p.address_city].filter(Boolean).join(' ')
  const out = [p.address_street, city].filter(Boolean).join(', ')
  return out || null
}

const sectionCls =
  'rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-4 sm:p-5'

/** Vue « document » d'un devis / facture / avoir finalisé (lecture seule). */
export function SalesDocumentReadOnly({ document: doc, lines, projectName, sourceNumber }: Props) {
  const client = doc.client_snapshot
  const address = partyAddress(client)
  return (
    <>
      <section className={sectionCls} aria-label="Informations du document">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Client">
            <span className="font-medium">{clientDisplayName(client)}</span>
            {doc.client_id ? (
              <Link to={`/dashboard/client/${doc.client_id}`} className="ml-2 text-xs text-[var(--accent)] underline">
                Voir la fiche
              </Link>
            ) : null}
            {client?.email ? <span className="block text-xs text-[var(--ink-soft)]">{client.email}</span> : null}
            {address ? <span className="block text-xs text-[var(--ink-soft)]">{address}</span> : null}
          </Field>
          {doc.title ? <Field label="Objet">{doc.title}</Field> : null}
          <Field label={doc.kind === 'quote' ? 'Date du devis' : 'Date d’émission'}>{formatDateFr(doc.issue_date)}</Field>
          {doc.kind === 'quote' ? <Field label="Valable jusqu’au">{formatDateFr(doc.valid_until)}</Field> : null}
          {doc.kind === 'invoice' ? <Field label="Échéance de paiement">{formatDateFr(doc.due_date)}</Field> : null}
          {doc.service_date ? <Field label="Prestation">{doc.service_date}</Field> : null}
          {projectName ? <Field label="Projet lié">{projectName}</Field> : null}
          {doc.kind === 'credit_note' && sourceNumber ? (
            <Field label="Facture annulée">
              <Link to={`/dashboard/documents/${doc.source_document_id}`} className="font-medium text-[var(--accent)] underline">
                {sourceNumber}
              </Link>
            </Field>
          ) : null}
        </dl>
      </section>

      <section className={sectionCls} aria-label="Prestations">
        <h2 className="font-display text-base font-semibold text-[var(--ink)]">Prestations</h2>
        <table className="mt-3 hidden w-full text-left text-sm font-body sm:table">
          <thead className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
            <tr>
              <th className="pb-2 font-semibold">Désignation</th>
              <th className="pb-2 text-right font-semibold">Qté</th>
              <th className="pb-2 text-right font-semibold">PU HT</th>
              {doc.vat_exempt ? null : <th className="pb-2 text-right font-semibold">TVA</th>}
              <th className="pb-2 text-right font-semibold">Total HT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {lines.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="whitespace-pre-line py-2.5 pr-3 text-[var(--ink)]">
                  {l.description}
                  {l.discount_percent > 0 ? (
                    <span className="block text-xs text-[var(--ink-muted)]">Remise {formatVatRate(l.discount_percent)}</span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-[var(--ink-soft)]">
                  {formatQuantity(l.quantity)}
                  {l.unit ? ` ${l.unit}` : ''}
                </td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums text-[var(--ink-soft)]">
                  {formatMoney(l.unit_price_ht)}
                </td>
                {doc.vat_exempt ? null : (
                  <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums text-[var(--ink-soft)]">
                    {formatVatRate(l.vat_rate)}
                  </td>
                )}
                <td className="whitespace-nowrap py-2.5 pl-3 text-right font-semibold tabular-nums text-[var(--ink)]">
                  {formatMoney(lineTotalHt(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 divide-y divide-[var(--border)] sm:hidden">
          {lines.map((l) => (
            <li key={l.id} className="py-2.5">
              <div className="flex justify-between gap-3">
                <p className="min-w-0 whitespace-pre-line text-sm text-[var(--ink)]">{l.description}</p>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ink)]">{formatMoney(lineTotalHt(l))}</p>
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-[var(--ink-muted)]">
                {formatQuantity(l.quantity)}
                {l.unit ? ` ${l.unit}` : ''} × {formatMoney(l.unit_price_ht)}
                {doc.vat_exempt ? '' : ` · TVA ${formatVatRate(l.vat_rate)}`}
                {l.discount_percent > 0 ? ` · remise ${formatVatRate(l.discount_percent)}` : ''}
              </p>
            </li>
          ))}
        </ul>
        {doc.vat_exempt ? (
          <p className="mt-3 text-xs text-[var(--ink-muted)]">{doc.vat_exemption_reason}</p>
        ) : null}
      </section>

      {doc.payment_terms || doc.notes ? (
        <section className={sectionCls} aria-label="Conditions et notes">
          <dl className="grid gap-4">
            {doc.payment_terms ? <Field label="Conditions de paiement">{doc.payment_terms}</Field> : null}
            {doc.notes ? (
              <Field label="Notes">
                <span className="whitespace-pre-line">{doc.notes}</span>
              </Field>
            ) : null}
          </dl>
        </section>
      ) : null}
    </>
  )
}
