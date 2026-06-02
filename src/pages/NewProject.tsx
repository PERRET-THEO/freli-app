import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getOrCreateAgency } from '../lib/agency'
import { sendProjectInviteEmail } from '../lib/resend'
import { supabase } from '../lib/supabase'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button, Card, Input } from '../components/ui'

type ChecklistItemType = 'text' | 'file' | 'signature'

type DraftChecklistItem = {
  id: string
  label: string
  type: ChecklistItemType
}

type ChecklistTemplateKey = 'website' | 'mobile' | 'branding'

const baseChecklist: DraftChecklistItem[] = [
  { id: crypto.randomUUID(), label: 'Formulaire de brief rempli', type: 'text' },
  { id: crypto.randomUUID(), label: 'Logo & charte graphique', type: 'file' },
  { id: crypto.randomUUID(), label: 'Contrat signé', type: 'signature' },
  { id: crypto.randomUUID(), label: 'Accès hébergeur', type: 'text' },
  { id: crypto.randomUUID(), label: 'Brief détaillé', type: 'text' },
]

const templateMap: Record<ChecklistTemplateKey, Omit<DraftChecklistItem, 'id'>[]> = {
  website: [
    { label: 'Brief', type: 'text' },
    { label: 'Logo', type: 'file' },
    { label: 'Accès hébergeur', type: 'text' },
    { label: 'Contrat', type: 'signature' },
    { label: 'Contenu pages', type: 'text' },
  ],
  mobile: [
    { label: 'Brief technique', type: 'text' },
    { label: 'Charte UI', type: 'file' },
    { label: 'Comptes stores', type: 'text' },
    { label: 'Contrat', type: 'signature' },
    { label: 'Spécifications', type: 'text' },
  ],
  branding: [
    { label: 'Brief créatif', type: 'text' },
    { label: 'Références visuelles', type: 'file' },
    { label: 'Contrat', type: 'signature' },
    { label: 'Formats souhaités', type: 'text' },
  ],
}

const typeLabel: Record<ChecklistItemType, string> = {
  text: 'Texte',
  file: 'Fichier',
  signature: 'Signature',
}

const INDUSTRIES = [
  'Web & Digital', 'E-commerce', 'Immobilier', 'Industrie', 'Santé',
  'Education', 'Restauration', 'Mode & Luxe', 'Autre',
]

const COMPANY_TYPES = [
  'Auto-entrepreneur', 'SARL', 'SAS', 'SASU', 'SA', 'Association', 'Autre',
]

const COMPANY_SIZES = ['1 personne', '2-5', '6-20', '21-50', '50+']

export function NewProject() {
  const [step, setStep] = useState<1 | 2>(1)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [isCompany, setIsCompany] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState('')
  const [siret, setSiret] = useState('')
  const [vatNumber, setVatNumber] = useState('')

  const [showExtra, setShowExtra] = useState(false)
  const [addressStreet, setAddressStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('France')

  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [notes, setNotes] = useState('')

  const [items, setItems] = useState<DraftChecklistItem[]>(baseChecklist)
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplateKey | ''>('')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [contractTemplates, setContractTemplates] = useState<{ id: string; name: string }[]>([])
  const [itemTemplates, setItemTemplates] = useState<Record<string, string>>({})
  const [projectPrice, setProjectPrice] = useState('')
  const [prefillClientId, setPrefillClientId] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const clientIdParam = searchParams.get('clientId')

  const onboardingLink = useMemo(
    () => (generatedToken ? `${window.location.origin}/p/${generatedToken}` : ''),
    [generatedToken],
  )

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      const agency = await getOrCreateAgency(userData.user.id)
      if (!agency?.id) return
      const { data } = await supabase
        .from('contract_templates')
        .select('id, name')
        .eq('agency_id', agency.id)
        .order('created_at', { ascending: false })
      setContractTemplates((data ?? []) as { id: string; name: string }[])
    }
    load()
  }, [])

  useEffect(() => {
    if (!clientIdParam) return
    const loadClient = async () => {
      const { data: c } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientIdParam)
        .maybeSingle()
      if (!c) return

      setFirstName(c.first_name ?? '')
      setLastName(c.last_name ?? '')
      setClientEmail(c.email ?? '')
      setPhone(c.phone ?? '')

      const hasCompany = Boolean(c.company_name || c.company_type || c.siret || c.vat_number)
      setIsCompany(hasCompany)
      setCompanyName(c.company_name ?? '')
      setCompanyType(c.company_type ?? '')
      setSiret(c.siret ?? '')
      setVatNumber(c.vat_number ?? '')

      const hasExtra = Boolean(
        c.address_street ||
          c.address_postal_code ||
          c.address_city ||
          c.website ||
          c.industry ||
          c.company_size ||
          c.notes,
      )
      setShowExtra(hasExtra)
      setAddressStreet(c.address_street ?? '')
      setPostalCode(c.address_postal_code ?? '')
      setCity(c.address_city ?? '')
      setCountry(c.address_country ?? 'France')
      setWebsite(c.website ?? '')
      setIndustry(c.industry ?? '')
      setCompanySize(c.company_size ?? '')
      setNotes(c.notes ?? '')

      setPrefillClientId(clientIdParam)
    }
    loadClient()
  }, [clientIdParam])

  const addItem = () => {
    const label = newItemLabel.trim()
    if (!label) return
    setItems((current) => [...current, { id: crypto.randomUUID(), label, type: 'text' }])
    setNewItemLabel('')
  }

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    setItemTemplates((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const handleStepOneSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !clientEmail.trim()) {
      setError('Le prénom, le nom et l\u2019email du client sont obligatoires.')
      return
    }
    setStep(2)
  }

  const handleCreateProject = async () => {
    if (!items.length) {
      setError('Ajoute au moins un item de checklist.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const token = crypto.randomUUID()
      const { data: userData, error: userError } = await supabase.auth.getUser()

      if (userError || !userData.user) {
        throw new Error('Utilisateur non connecté. Merci de vous reconnecter.')
      }

      const agency = await getOrCreateAgency(userData.user.id)
      if (!agency?.id) {
        throw new Error('Impossible de créer automatiquement votre agence.')
      }
      const agencyId = agency.id
      const agencyName = agency.name

      const fullName = `${firstName.trim()} ${lastName.trim()}`
      const email = clientEmail.trim()

      let clientId: string | null = null

      if (prefillClientId) {
        clientId = prefillClientId
        const clientUpdate: Record<string, unknown> = {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email,
          phone: phone.trim() || null,
          company_name: isCompany ? companyName.trim() || null : null,
          company_type: isCompany ? companyType || null : null,
          siret: isCompany ? siret.trim() || null : null,
          vat_number: isCompany ? vatNumber.trim() || null : null,
          address_street: showExtra ? addressStreet.trim() || null : null,
          address_postal_code: showExtra ? postalCode.trim() || null : null,
          address_city: showExtra ? city.trim() || null : null,
          address_country: showExtra ? country.trim() || 'France' : null,
          website: showExtra ? website.trim() || null : null,
          industry: showExtra ? industry || null : null,
          company_size: showExtra ? companySize || null : null,
          notes: showExtra ? notes.trim() || null : null,
          updated_at: new Date().toISOString(),
        }
        const { error: clientUpdateError } = await supabase
          .from('clients')
          .update(clientUpdate)
          .eq('id', prefillClientId)
        if (clientUpdateError) {
          console.warn('Client update failed:', clientUpdateError.message)
        }
      } else {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id')
          .eq('agency_id', agencyId)
          .eq('email', email)
          .maybeSingle()

        if (existingClient?.id) {
          clientId = existingClient.id
        } else {
          const clientPayload: Record<string, unknown> = {
            agency_id: agencyId,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email,
            phone: phone.trim() || null,
          }
          if (isCompany) {
            clientPayload.company_name = companyName.trim() || null
            clientPayload.company_type = companyType || null
            clientPayload.siret = siret.trim() || null
            clientPayload.vat_number = vatNumber.trim() || null
          }
          if (showExtra) {
            clientPayload.address_street = addressStreet.trim() || null
            clientPayload.address_postal_code = postalCode.trim() || null
            clientPayload.address_city = city.trim() || null
            clientPayload.address_country = country.trim() || 'France'
            clientPayload.website = website.trim() || null
            clientPayload.industry = industry || null
            clientPayload.company_size = companySize || null
            clientPayload.notes = notes.trim() || null
          }

          const { data: newClient, error: clientError } = await supabase
            .from('clients')
            .insert(clientPayload)
            .select('id')
            .single()

          if (clientError) {
            console.warn('Client insert failed (table may not exist yet):', clientError.message)
          } else {
            clientId = newClient.id
          }
        }
      }

      const projectInsert: Record<string, unknown> = {
        agency_id: agencyId,
        client_name: fullName,
        client_email: email,
        token,
      }
      if (clientId) projectInsert.client_id = clientId

      const euros = Math.round(parseFloat(projectPrice.replace(',', '.')))
      if (Number.isFinite(euros) && euros > 0) {
        projectInsert.price = euros
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert(projectInsert)
        .select('id, token')
        .single()

      if (projectError || !project) {
        throw new Error(projectError?.message ?? 'Impossible de créer le projet.')
      }

      const checklistPayload = items.map((item, index) => ({
        project_id: project.id,
        label: item.label,
        type: item.type,
        required: true,
        order_index: index,
        completed: false,
        value:
          item.type === 'signature' && itemTemplates[item.id]
            ? JSON.stringify({ template_id: itemTemplates[item.id], status: 'pending' })
            : null,
      }))

      const { error: checklistError } = await supabase
        .from('checklist_items')
        .insert(checklistPayload)

      if (checklistError) {
        throw new Error(checklistError.message)
      }

      await sendProjectInviteEmail({
        projectId: project.id,
        token: project.token,
        clientName: fullName,
        clientEmail: email,
        agencyName,
      })

      setGeneratedToken(project.token)
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : 'Une erreur est survenue pendant la création.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!onboardingLink) return
    await navigator.clipboard.writeText(onboardingLink)
    setCopySuccess(true)
    window.setTimeout(() => setCopySuccess(false), 1800)
  }

  const applyTemplate = (templateKey: ChecklistTemplateKey) => {
    const templateItems = templateMap[templateKey].map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    }))
    setSelectedTemplate(templateKey)
    setItems(templateItems)
    setItemTemplates({})
  }

  const useEmptyTemplate = () => {
    setSelectedTemplate('')
    setItems([])
    setItemTemplates({})
  }

  const selectCls =
    'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

  const stepSubtitle =
    step === 1 ? 'Étape 1/2 — Client' : 'Étape 2/2 — Checklist'

  return (
    <DashboardLayout title="Nouveau projet" subtitle={stepSubtitle} maxWidth="4xl">
        <Card>
          <div className="flex items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-display font-bold ${step === 1 ? 'bg-[var(--accent)] text-[var(--white)]' : 'bg-[var(--mint-soft)] text-[var(--mint)]'}`}>1</div>
              <span className="text-sm font-body text-[var(--ink-soft)]">Client</span>
            </div>
            <span className="text-sm text-[var(--ink-muted)]">→</span>
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-display font-bold ${step === 2 ? 'bg-[var(--accent)] text-[var(--white)]' : 'bg-[var(--surface-warm)] text-[var(--ink-muted)]'}`}>2</div>
              <span className="text-sm font-body text-[var(--ink-soft)]">Checklist</span>
            </div>
          </div>

          {step === 1 ? (
            <form className="mt-6 space-y-5" onSubmit={handleStepOneSubmit}>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations personnelles</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Prénom *" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <Input placeholder="Nom *" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input type="email" placeholder="Email professionnel *" required value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                  <Input type="tel" placeholder="+33 6 00 00 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={isCompany} onChange={(e) => setIsCompany(e.target.checked)} className="h-4 w-4 rounded accent-[var(--accent)]" />
                  <span className="font-display text-base font-semibold text-[var(--ink)]">Mon client est une entreprise</span>
                </label>
                {isCompany && (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input placeholder="Nom de l'entreprise" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                      <select className={selectCls} value={companyType} onChange={(e) => setCompanyType(e.target.value)}>
                        <option value="">Type d&apos;entreprise</option>
                        {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input placeholder="SIRET (14 chiffres)" value={siret} onChange={(e) => setSiret(e.target.value)} maxLength={14} />
                      <Input placeholder="N° TVA (FR + 11 chiffres)" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowExtra(!showExtra)}
                className="text-sm font-body font-medium text-[var(--accent)] hover:underline"
              >
                {showExtra ? '− Masquer les infos complémentaires' : '+ Ajouter plus d\u2019infos'}
              </button>

              {showExtra && (
                <>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                    <h3 className="font-display text-base font-semibold text-[var(--ink)]">Adresse</h3>
                    <div className="mt-3 space-y-3">
                      <Input placeholder="Rue" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Input placeholder="Code postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} maxLength={5} />
                        <Input placeholder="Ville" value={city} onChange={(e) => setCity(e.target.value)} />
                        <Input placeholder="Pays" value={country} onChange={(e) => setCountry(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                    <h3 className="font-display text-base font-semibold text-[var(--ink)]">Informations complémentaires</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Input placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
                      <select className={selectCls} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                        <option value="">Secteur d&apos;activité</option>
                        {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                    <div className="mt-3">
                      <p className="mb-2 text-sm font-body text-[var(--ink-soft)]">Taille de l&apos;entreprise</p>
                      <div className="flex flex-wrap gap-2">
                        {COMPANY_SIZES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setCompanySize(s)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-body transition ${companySize === s ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--ink-muted)]'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      placeholder="Informations importantes sur ce client..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
                      rows={3}
                    />
                  </div>
                </>
              )}

              {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}
              <Button type="submit" className="w-full">Suivant →</Button>
            </form>
          ) : (
            <div className="mt-6">
              <p className="text-sm font-body text-[var(--ink-muted)]">Configure la checklist de démarrage.</p>

              <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] p-5">
                <label className="mb-1 block font-display text-base font-semibold text-[var(--ink)]">
                  Prix (€)
                </label>
                <p className="mb-2 text-xs font-body text-[var(--ink-muted)]">
                  Montant facturé au client à la fin de l&apos;onboarding si Stripe est activé dans Intégrations. Laisser vide pour ne pas proposer de paiement.
                </p>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="ex: 650"
                  value={projectPrice}
                  onChange={(e) => setProjectPrice(e.target.value)}
                />
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  className={selectCls}
                  value={selectedTemplate}
                  onChange={(event) => {
                    const value = event.target.value as ChecklistTemplateKey
                    if (!value) return
                    applyTemplate(value)
                  }}
                >
                  <option value="">Partir d&apos;un template</option>
                  <option value="website">Site web</option>
                  <option value="mobile">Application mobile</option>
                  <option value="branding">Identité visuelle</option>
                </select>
                <Button variant="secondary" onClick={useEmptyTemplate}>Template vide</Button>
              </div>

              <div className="mt-4 space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-body text-[var(--ink)]">{item.label}</p>
                      <p className="text-xs font-body text-[var(--ink-muted)]">Type: {typeLabel[item.type]}</p>
                      {item.type === 'signature' && (
                        <div className="mt-2">
                          <p className="text-xs font-body text-[var(--ink-muted)]">Contrat à faire signer :</p>
                          <select
                            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-3 py-2 text-xs font-body text-[var(--ink)]"
                            value={itemTemplates[item.id] ?? ''}
                            onChange={(e) => setItemTemplates((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          >
                            <option value="">Aucun contrat (signature simple)</option>
                            {contractTemplates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="ml-3 h-8 w-8 shrink-0 rounded-full border border-[var(--border)] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      aria-label="Supprimer cet item"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input placeholder="Nouvel item (type texte)" value={newItemLabel} onChange={(event) => setNewItemLabel(event.target.value)} />
                <Button variant="secondary" onClick={addItem}>Ajouter un item</Button>
              </div>

              {error ? <p className="mt-3 text-sm font-body text-[var(--amber)]">{error}</p> : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button variant="secondary" onClick={() => setStep(1)}>← Retour</Button>
                <Button className="w-full py-4 text-base" onClick={handleCreateProject} disabled={loading}>
                  {loading ? 'Génération...' : "Générer le lien d'onboarding"}
                </Button>
              </div>
            </div>
          )}
        </Card>

      {generatedToken ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/45 px-4">
          <Card className="w-full max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">🎉 Lien généré !</h2>
            <p className="mt-4 break-all rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3 text-sm font-body text-[var(--ink)]">{onboardingLink}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleCopy}>{copySuccess ? 'Copie effectuée' : 'Copier le lien'}</Button>
              {prefillClientId ? (
                <Link to={`/dashboard/client/${prefillClientId}`} className="w-full sm:w-auto"><Button variant="secondary" className="w-full">Retour à la fiche client</Button></Link>
              ) : (
                <Link to="/dashboard" className="w-full sm:w-auto"><Button variant="secondary" className="w-full">Retour au dashboard</Button></Link>
              )}
              <Button variant="secondary" onClick={() => navigate(`/p/${generatedToken}`)}>Ouvrir le portail</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </DashboardLayout>
  )
}
