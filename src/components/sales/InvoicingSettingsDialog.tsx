import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEFAULT_LATE_PENALTY_RATE,
  DEFAULT_VAT_EXEMPTION_REASON,
  formatVatRate,
  VAT_RATES,
  type InvoicingSettings,
} from '../../lib/salesDocuments'
import {
  getAgencyIssuer,
  getInvoicingSettings,
  saveInvoicingSettings,
  type AgencyIssuerRow,
} from '../../lib/salesDocumentsApi'
import { Button } from '../ui'

type Props = {
  agencyId: string
  onClose: () => void
  onSaved: (settings: InvoicingSettings) => void
}

const inputCls =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 font-body text-sm text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
const labelCls = 'mb-1 block text-xs font-body font-medium text-[var(--ink-soft)]'

export function InvoicingSettingsDialog({ agencyId, onClose, onSaved }: Props) {
  const titleId = useId()
  const [settings, setSettings] = useState<InvoicingSettings | null>(null)
  const [issuer, setIssuer] = useState<AgencyIssuerRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getInvoicingSettings(agencyId), getAgencyIssuer(agencyId)])
      .then(([s, i]) => {
        if (cancelled) return
        setSettings(s)
        setIssuer(i)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [agencyId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const patch = (p: Partial<InvoicingSettings>) => setSettings((s) => (s ? { ...s, ...p } : s))

  const submit = async () => {
    if (!settings) return
    if (settings.payment_terms_days < 0 || settings.payment_terms_days > 60) {
      setError('Le délai de paiement ne peut pas dépasser 60 jours (art. L441-10 du Code de commerce).')
      return
    }
    if (settings.quote_validity_days < 1 || settings.quote_validity_days > 365) {
      setError('La validité des devis doit être comprise entre 1 et 365 jours.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const clean: InvoicingSettings = {
        ...settings,
        vat_exemption_reason: settings.vat_exempt
          ? settings.vat_exemption_reason?.trim() || DEFAULT_VAT_EXEMPTION_REASON
          : settings.vat_exemption_reason?.trim() || null,
        late_penalty_rate: settings.late_penalty_rate.trim() || DEFAULT_LATE_PENALTY_RATE,
        iban: settings.iban?.trim() || null,
        bic: settings.bic?.trim() || null,
        payment_instructions: settings.payment_instructions?.trim() || null,
        footer_note: settings.footer_note?.trim() || null,
      }
      await saveInvoicingSettings(clean)
      onSaved(clean)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const missingLegal = issuer
    ? [
        !issuer.siret && 'SIRET',
        (!issuer.address_street || !issuer.address_city) && 'adresse',
        !issuer.legal_form && 'forme juridique',
      ].filter(Boolean)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(13,15,20,0.45)] backdrop-blur-[2px] p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] shadow-lg sm:rounded-[var(--radius-md)]"
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="font-display text-lg font-bold text-[var(--ink)]">
            Paramètres de facturation
          </h2>
          <p className="mt-0.5 text-xs font-body text-[var(--ink-muted)]">
            Valeurs par défaut des nouveaux devis et factures. Les documents déjà émis ne changent pas.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!settings && !error ? (
            <p className="text-sm text-[var(--ink-muted)]">Chargement…</p>
          ) : null}

          {missingLegal.length > 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--status-blocked-border)] bg-[var(--status-blocked-soft)] px-3 py-2 text-sm text-[var(--status-blocked)]">
              Informations légales incomplètes ({missingLegal.join(', ')}) : elles sont obligatoires sur
              vos factures.{' '}
              <Link to="/dashboard/settings#settings-legal" className="font-semibold underline">
                Compléter
              </Link>
            </div>
          ) : null}

          {settings ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="set-terms">
                    Délai de paiement (jours)
                  </label>
                  <input
                    id="set-terms"
                    type="number"
                    min={0}
                    max={60}
                    className={inputCls}
                    value={settings.payment_terms_days}
                    onChange={(e) => patch({ payment_terms_days: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="set-validity">
                    Validité des devis (jours)
                  </label>
                  <input
                    id="set-validity"
                    type="number"
                    min={1}
                    max={365}
                    className={inputCls}
                    value={settings.quote_validity_days}
                    onChange={(e) => patch({ quote_validity_days: Number(e.target.value) })}
                  />
                </div>
              </div>

              <fieldset className="rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
                <legend className="px-1 text-xs font-semibold text-[var(--ink-soft)]">TVA</legend>
                <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    checked={settings.vat_exempt}
                    onChange={(e) =>
                      patch({
                        vat_exempt: e.target.checked,
                        vat_exemption_reason:
                          e.target.checked && !settings.vat_exemption_reason
                            ? DEFAULT_VAT_EXEMPTION_REASON
                            : settings.vat_exemption_reason,
                      })
                    }
                  />
                  <span>
                    TVA non applicable (franchise en base, micro-entreprise…)
                  </span>
                </label>
                {settings.vat_exempt ? (
                  <div className="mt-3">
                    <label className={labelCls} htmlFor="set-reason">
                      Mention d’exonération
                    </label>
                    <input
                      id="set-reason"
                      className={inputCls}
                      maxLength={300}
                      value={settings.vat_exemption_reason ?? ''}
                      onChange={(e) => patch({ vat_exemption_reason: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="mt-3">
                    <label className={labelCls} htmlFor="set-vat">
                      Taux par défaut
                    </label>
                    <select
                      id="set-vat"
                      className={inputCls}
                      value={String(settings.default_vat_rate)}
                      onChange={(e) => patch({ default_vat_rate: Number(e.target.value) })}
                    >
                      {VAT_RATES.map((r) => (
                        <option key={r} value={String(r)}>
                          {formatVatRate(r)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <div>
                  <label className={labelCls} htmlFor="set-iban">
                    IBAN (affiché sur les factures)
                  </label>
                  <input
                    id="set-iban"
                    className={`${inputCls} font-mono`}
                    maxLength={64}
                    autoComplete="off"
                    value={settings.iban ?? ''}
                    onChange={(e) => patch({ iban: e.target.value.toUpperCase() })}
                    placeholder="FR76 …"
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="set-bic">
                    BIC
                  </label>
                  <input
                    id="set-bic"
                    className={`${inputCls} font-mono`}
                    maxLength={16}
                    autoComplete="off"
                    value={settings.bic ?? ''}
                    onChange={(e) => patch({ bic: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls} htmlFor="set-instructions">
                  Instructions de règlement (optionnel)
                </label>
                <textarea
                  id="set-instructions"
                  rows={2}
                  maxLength={1000}
                  className={inputCls}
                  value={settings.payment_instructions ?? ''}
                  onChange={(e) => patch({ payment_instructions: e.target.value })}
                  placeholder="Ex. Merci d’indiquer le numéro de facture en référence du virement."
                />
              </div>

              <div>
                <label className={labelCls} htmlFor="set-penalty">
                  Taux des pénalités de retard
                </label>
                <input
                  id="set-penalty"
                  className={inputCls}
                  maxLength={200}
                  value={settings.late_penalty_rate}
                  onChange={(e) => patch({ late_penalty_rate: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                  Mention obligatoire. Minimum légal : trois fois le taux d’intérêt légal.
                </p>
              </div>

              <div>
                <label className={labelCls} htmlFor="set-footer">
                  Note de bas de document (optionnel)
                </label>
                <textarea
                  id="set-footer"
                  rows={2}
                  maxLength={1000}
                  className={inputCls}
                  value={settings.footer_note ?? ''}
                  onChange={(e) => patch({ footer_note: e.target.value })}
                />
              </div>
            </>
          ) : null}

          {error ? (
            <p className="text-sm text-[#c2410c]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <Button variant="secondary" className="px-4 py-2" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button className="px-4 py-2" onClick={() => void submit()} disabled={!settings || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
