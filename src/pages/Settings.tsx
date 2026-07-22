import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { BrandColorPicker } from '../components/settings/BrandColorPicker'
import { LogoUpload } from '../components/settings/LogoUpload'
import { PortalPreviewLink } from '../components/settings/PortalPreviewLink'
import { ReminderSettingsPanel } from '../components/settings/ReminderSettingsPanel'
import { AgencyLegalProfilePanel } from '../components/settings/AgencyLegalProfilePanel'
import { AiModulesPanel, type AiModuleFlags } from '../components/settings/AiModulesPanel'
import { SettingsNav } from '../components/settings/SettingsNav'
import { SettingsSection } from '../components/settings/SettingsSection'
import { SettingsSkeleton } from '../components/settings/SettingsSkeleton'
import {
  DEFAULT_BRAND_COLOR,
  normalizeBrandColor,
  type AgencyBranding,
} from '../lib/agencyBranding'
import { getOrCreateAgency } from '../lib/agency'
import { AGENCY_SELECT_BASE, mergeAgencyWithAiFlags } from '../lib/agencyQueries'
import { normalizeReminderDelayHours } from '../lib/reminderSettings'
import {
  normalizeSmartReminderMax,
  normalizeSmartReminderTone,
  type SmartReminderTone,
} from '../lib/smartReminders'
import { supabase } from '../lib/supabase'
import type { CompanyLookupResult, LegalDataSource } from '../lib/companyLookup'
import { SUPPORT_EMAIL, supportMailto } from '../lib/support'
import { Button, Card, Input } from '../components/ui'

type SectionFeedback = { type: 'success' | 'error'; text: string } | null

const AGENCY_SELECT = AGENCY_SELECT_BASE

function SectionMessage({ feedback }: { feedback: SectionFeedback }) {
  if (!feedback) return null
  return (
    <p
      className={`text-sm font-body ${
        feedback.type === 'success' ? 'text-[var(--mint)]' : 'text-[var(--amber)]'
      }`}
    >
      {feedback.text}
    </p>
  )
}

function accountInitials(email: string): string {
  const part = email.split('@')[0] ?? 'U'
  return part.slice(0, 2).toUpperCase()
}

export function Settings() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [agency, setAgency] = useState<AgencyBranding | null>(null)
  const [agencyName, setAgencyName] = useState('')
  const [tagline, setTagline] = useState('')
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [legalForm, setLegalForm] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressPostalCode, setAddressPostalCode] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [siret, setSiret] = useState('')
  const [shareCapital, setShareCapital] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [rcsCity, setRcsCity] = useState('')
  const [siren, setSiren] = useState('')
  const [codeNaf, setCodeNaf] = useState('')
  const [legalSource, setLegalSource] = useState<LegalDataSource | null>(null)
  const [legalFeedback, setLegalFeedback] = useState<SectionFeedback>(null)
  const [legalSaving, setLegalSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [agencyFeedback, setAgencyFeedback] = useState<SectionFeedback>(null)
  const [passwordFeedback, setPasswordFeedback] = useState<SectionFeedback>(null)
  const [agencySaving, setAgencySaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [autoRemindersEnabled, setAutoRemindersEnabled] = useState(true)
  const [autoRemindersDelayHours, setAutoRemindersDelayHours] = useState(48)
  const [reminderFeedback, setReminderFeedback] = useState<SectionFeedback>(null)
  const [reminderSaving, setReminderSaving] = useState(false)
  const [aiFlags, setAiFlags] = useState<AiModuleFlags>({
    extraction: false,
    reminders: false,
    contracts: false,
  })
  const [aiFeedback, setAiFeedback] = useState<SectionFeedback>(null)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiReminderTone, setAiReminderTone] = useState<SmartReminderTone>('professional')
  const [aiReminderAutoSend, setAiReminderAutoSend] = useState(false)
  const [aiReminderMax, setAiReminderMax] = useState(3)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  const loadAgencyFields = (row: AgencyBranding) => {
    setAgency(row)
    setAgencyName(row.name ?? '')
    setTagline(row.tagline ?? '')
    setBrandColor(normalizeBrandColor(row.brand_color))
    setWelcomeMessage(row.portal_welcome_message ?? '')
    setContactEmail(row.contact_email ?? '')
    setContactPhone(row.contact_phone ?? '')
    setLegalForm(row.legal_form ?? '')
    setAddressStreet(row.address_street ?? '')
    setAddressPostalCode(row.address_postal_code ?? '')
    setAddressCity(row.address_city ?? '')
    setSiret(row.siret ?? '')
    setShareCapital(row.share_capital ?? '')
    setVatNumber(row.vat_number ?? '')
    setRcsCity(row.rcs_city ?? '')
    setSiren(row.siren ?? '')
    setCodeNaf(row.code_naf ?? '')
    setLegalSource((row.source_donnees_legales as LegalDataSource | null) ?? null)
    setAutoRemindersEnabled(row.auto_reminders_enabled !== false)
    setAutoRemindersDelayHours(normalizeReminderDelayHours(row.auto_reminders_delay_hours))
    setAiFlags({
      extraction: row.ai_extraction_enabled === true,
      reminders: row.ai_reminders_enabled === true,
      contracts: row.ai_contracts_enabled === true,
    })
    setAiReminderTone(normalizeSmartReminderTone(row.ai_reminder_tone))
    setAiReminderAutoSend(row.ai_reminder_auto_send === true)
    setAiReminderMax(normalizeSmartReminderMax(row.ai_reminder_max_per_project))
  }

  useEffect(() => {
    const loadSettings = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        setPageLoading(false)
        return
      }
      setUserId(userData.user.id)
      setAccountEmail(userData.user.email ?? '')

      const { data: agencyData } = await supabase
        .from('agencies')
        .select(AGENCY_SELECT)
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (agencyData) loadAgencyFields(await mergeAgencyWithAiFlags(agencyData as AgencyBranding))
      setPageLoading(false)
    }

    loadSettings()
  }, [])

  const previewData = useMemo(
    () => ({
      name: agencyName.trim() || 'Mon agence',
      logoUrl: logoPreviewUrl ?? agency?.logo_url ?? null,
      brandColor: normalizeBrandColor(brandColor),
      tagline: tagline.trim(),
      welcomeMessage: welcomeMessage.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
    }),
    [
      agency?.logo_url,
      agencyName,
      brandColor,
      contactEmail,
      contactPhone,
      logoPreviewUrl,
      tagline,
      welcomeMessage,
    ],
  )

  const uploadLogo = async (agencyId: string, currentLogoUrl: string | null): Promise<string | null> => {
    if (!logoFile) return currentLogoUrl

    const fileExt = logoFile.name.split('.').pop() || 'png'
    const filePath = `${agencyId}/logo-${Date.now()}.${fileExt}`
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(filePath, logoFile, { upsert: true })
    if (uploadError) throw new Error("Impossible d'uploader le logo.")
    const { data } = supabase.storage.from('logos').getPublicUrl(filePath)
    return data.publicUrl
  }

  const handleSaveAgency = async () => {
    setAgencyFeedback(null)
    if (logoError) {
      setAgencyFeedback({ type: 'error', text: logoError })
      return
    }
    const trimmedName = agencyName.trim()
    if (!trimmedName) {
      setAgencyFeedback({ type: 'error', text: 'Le nom de l’agence est obligatoire.' })
      return
    }
    if (!userId) {
      setAgencyFeedback({ type: 'error', text: 'Session invalide. Reconnectez-vous.' })
      return
    }

    const payload = {
      name: trimmedName,
      tagline: tagline.trim() || null,
      brand_color: normalizeBrandColor(brandColor),
      portal_welcome_message: welcomeMessage.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
    }

    setAgencySaving(true)
    try {
      if (agency?.id) {
        const logoUrl = await uploadLogo(agency.id, agency.logo_url)
        const { data: updated, error: updateError } = await supabase
          .from('agencies')
          .update({ ...payload, logo_url: logoUrl })
          .eq('id', agency.id)
          .select(AGENCY_SELECT)
          .single()

        if (updateError) {
          setAgencyFeedback({ type: 'error', text: updateError.message })
          return
        }

        loadAgencyFields(await mergeAgencyWithAiFlags(updated as AgencyBranding))
        setLogoFile(null)
        setAgencyFeedback({ type: 'success', text: 'Paramètres enregistrés.' })
        showToast('Paramètres enregistrés.')
        return
      }

      const createdBase = await getOrCreateAgency(userId, trimmedName)
      if (!createdBase?.id) {
        setAgencyFeedback({ type: 'error', text: 'Impossible de créer votre agence.' })
        return
      }

      let logoUrl: string | null = null
      if (logoFile) logoUrl = await uploadLogo(createdBase.id, null)

      const { data: created, error: updateNameError } = await supabase
        .from('agencies')
        .update({ ...payload, logo_url: logoUrl })
        .eq('id', createdBase.id)
        .select(AGENCY_SELECT)
        .single()

      if (updateNameError || !created) {
        setAgencyFeedback({
          type: 'error',
          text: updateNameError?.message ?? 'Impossible de créer votre agence.',
        })
        return
      }

      loadAgencyFields(await mergeAgencyWithAiFlags(created as AgencyBranding))
      setLogoFile(null)
      setAgencyFeedback({ type: 'success', text: 'Agence créée et enregistrée.' })
      showToast('Agence créée.')
    } catch (reason) {
      setAgencyFeedback({
        type: 'error',
        text: reason instanceof Error ? reason.message : 'Erreur lors de l’enregistrement.',
      })
    } finally {
      setAgencySaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordFeedback(null)
    if (!password || password !== passwordConfirm) {
      setPasswordFeedback({ type: 'error', text: 'Les mots de passe ne correspondent pas.' })
      return
    }
    if (password.length < 6) {
      setPasswordFeedback({
        type: 'error',
        text: 'Le mot de passe doit contenir au moins 6 caractères.',
      })
      return
    }

    setPasswordSaving(true)
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    setPasswordSaving(false)

    if (passwordError) {
      setPasswordFeedback({ type: 'error', text: passwordError.message })
      return
    }
    setPassword('')
    setPasswordConfirm('')
    setShowPasswordForm(false)
    setPasswordFeedback({ type: 'success', text: 'Mot de passe mis à jour.' })
    showToast('Mot de passe mis à jour.')
  }

  const handleSaveReminders = async () => {
    setReminderFeedback(null)
    if (!agency?.id) {
      setReminderFeedback({
        type: 'error',
        text: 'Créez d’abord votre agence dans la section Organisation.',
      })
      return
    }

    setReminderSaving(true)
    const { data: updated, error } = await supabase
      .from('agencies')
      .update({
        auto_reminders_enabled: autoRemindersEnabled,
        auto_reminders_delay_hours: normalizeReminderDelayHours(autoRemindersDelayHours),
        ai_reminder_tone: aiReminderTone,
        ai_reminder_auto_send: aiReminderAutoSend,
        ai_reminder_max_per_project: normalizeSmartReminderMax(aiReminderMax),
      })
      .eq('id', agency.id)
      .select(AGENCY_SELECT)
      .single()

    setReminderSaving(false)

    if (error) {
      setReminderFeedback({ type: 'error', text: error.message })
      return
    }

    loadAgencyFields(await mergeAgencyWithAiFlags(updated as AgencyBranding))
    setReminderFeedback({ type: 'success', text: 'Paramètres de relance enregistrés.' })
    showToast('Relances enregistrées.')
  }

  /** Pré-remplissage depuis l'API Recherche d'Entreprises (autocomplete ou refresh). */
  const handleLegalCompanySelect = (company: CompanyLookupResult) => {
    if (company.raison_sociale && !agencyName.trim()) setAgencyName(company.raison_sociale)
    setLegalForm(company.forme_juridique)
    setAddressStreet(company.adresse)
    setAddressPostalCode(company.code_postal)
    setAddressCity(company.ville)
    setSiret(company.siret)
    setSiren(company.siren)
    setCodeNaf(company.code_naf)
    if (company.vat_number) setVatNumber(company.vat_number)
    setLegalSource('api_gouv')
  }

  /** Une correction manuelle après pré-remplissage API change la source des données. */
  const markLegalManualEdit = () => {
    setLegalSource((source) => (source === 'api_gouv' ? 'saisie_manuelle' : source))
  }

  const handleSaveLegal = async () => {
    if (!agency?.id) {
      setLegalFeedback({ type: 'error', text: 'Créez d’abord votre agence dans Organisation.' })
      return
    }
    setLegalSaving(true)
    setLegalFeedback(null)
    const { data: updated, error } = await supabase
      .from('agencies')
      .update({
        legal_form: legalForm.trim() || null,
        address_street: addressStreet.trim() || null,
        address_postal_code: addressPostalCode.trim() || null,
        address_city: addressCity.trim() || null,
        siret: siret.trim() || null,
        share_capital: shareCapital.trim() || null,
        vat_number: vatNumber.trim() || null,
        rcs_city: rcsCity.trim() || null,
        siren: siren.trim() || null,
        code_naf: codeNaf.trim() || null,
        source_donnees_legales: legalSource,
      })
      .eq('id', agency.id)
      .select(AGENCY_SELECT)
      .single()
    setLegalSaving(false)
    if (error || !updated) {
      setLegalFeedback({ type: 'error', text: error?.message ?? 'Enregistrement impossible.' })
      return
    }
    loadAgencyFields(await mergeAgencyWithAiFlags(updated as AgencyBranding))
    setLegalFeedback({ type: 'success', text: 'Informations légales enregistrées.' })
    showToast('Informations légales enregistrées.')
  }

  const handleSaveAi = async () => {
    setAiFeedback(null)
    if (!agency?.id) {
      setAiFeedback({
        type: 'error',
        text: 'Créez d’abord votre agence dans la section Organisation.',
      })
      return
    }

    setAiSaving(true)
    const { data: updated, error } = await supabase
      .from('agencies')
      .update({
        ai_extraction_enabled: aiFlags.extraction,
        ai_reminders_enabled: aiFlags.reminders,
        ai_contracts_enabled: aiFlags.contracts,
      })
      .eq('id', agency.id)
      .select(AGENCY_SELECT)
      .single()

    setAiSaving(false)

    if (error) {
      setAiFeedback({ type: 'error', text: error.message })
      return
    }

    loadAgencyFields(await mergeAgencyWithAiFlags(updated as AgencyBranding))
    setAiFeedback({ type: 'success', text: 'Modules IA enregistrés.' })
    showToast('Modules IA enregistrés.')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  if (pageLoading) {
    return (
      <DashboardLayout title="Paramètres" subtitle="Agence, portail client et compte" maxWidth="5xl">
        <SettingsSkeleton />
      </DashboardLayout>
    )
  }

  const planLabel = agency?.plan?.trim() || 'Accès Freli'

  return (
    <DashboardLayout title="Paramètres" subtitle="Agence, portail client et compte" maxWidth="5xl">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            {previewData.logoUrl ? (
              <img
                src={previewData.logoUrl}
                alt=""
                className="h-16 w-16 rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full font-display text-lg font-bold text-white"
                style={{ backgroundColor: previewData.brandColor }}
              >
                {agencyName.trim().slice(0, 2).toUpperCase() || 'AG'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold text-[var(--ink)]">
                  {agencyName.trim() || 'Mon agence'}
                </h2>
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
                  {planLabel}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-body text-[var(--ink-muted)]">{accountEmail}</p>
              {tagline.trim() ? (
                <p className="mt-0.5 text-sm font-body text-[var(--ink-soft)]">{tagline.trim()}</p>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[200px_1fr] lg:items-start">
          <SettingsNav />

          <div className="space-y-4">
            <SettingsSection
              id="settings-organisation"
              icon="🏢"
              title={agency ? 'Organisation' : 'Créer mon agence'}
              description="Nom et logo affichés sur vos espaces clients et emails."
            >
              <div className="space-y-4">
                <Input
                  placeholder="Nom de l'agence"
                  value={agencyName}
                  onChange={(event) => setAgencyName(event.target.value)}
                />
                <LogoUpload
                  currentUrl={agency?.logo_url ?? null}
                  file={logoFile}
                  onFileChange={setLogoFile}
                  onError={setLogoError}
                />
                <div className="rounded-[var(--radius-sm)] bg-[var(--surface-warm)] p-3">
                  <p className="text-xs font-body font-medium text-[var(--ink-soft)]">Comment ça marche</p>
                  <p className="mt-1.5 text-xs font-body leading-relaxed text-[var(--ink-muted)]">
                    Le logo et le nom apparaissent en en-tête du portail client et dans les communications
                    liées à vos projets.
                  </p>
                </div>
                <Button onClick={handleSaveAgency} disabled={agencySaving}>
                  {agencySaving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection
              id="settings-legal"
              icon="📋"
              title="Informations légales"
              description="Adresse, SIRET et mentions légales utilisées dans vos contrats générés par l'IA."
            >
              <AgencyLegalProfilePanel
                legalForm={legalForm}
                addressStreet={addressStreet}
                addressPostalCode={addressPostalCode}
                addressCity={addressCity}
                siret={siret}
                siren={siren}
                shareCapital={shareCapital}
                vatNumber={vatNumber}
                rcsCity={rcsCity}
                onLegalFormChange={(v) => { setLegalForm(v); markLegalManualEdit() }}
                onAddressStreetChange={(v) => { setAddressStreet(v); markLegalManualEdit() }}
                onAddressPostalCodeChange={(v) => { setAddressPostalCode(v); markLegalManualEdit() }}
                onAddressCityChange={(v) => { setAddressCity(v); markLegalManualEdit() }}
                onSiretChange={(v) => { setSiret(v); markLegalManualEdit() }}
                onShareCapitalChange={setShareCapital}
                onVatNumberChange={(v) => { setVatNumber(v); markLegalManualEdit() }}
                onRcsCityChange={setRcsCity}
                onCompanySelect={handleLegalCompanySelect}
                onSave={handleSaveLegal}
                saving={legalSaving}
              />
              <SectionMessage feedback={legalFeedback} />
            </SettingsSection>

            <SettingsSection
              id="settings-portail"
              icon="🎨"
              title="Portail client"
              description="Personnalisez l'expérience de vos clients pendant l'onboarding."
            >
              <div className="space-y-4">
                <Input
                  placeholder="Sous-titre (ex. Studio créatif à Paris)"
                  value={tagline}
                  onChange={(event) => setTagline(event.target.value)}
                />
                <div>
                  <label className="mb-1.5 block text-sm font-body font-medium text-[var(--ink-soft)]">
                    Message d&apos;accueil
                  </label>
                  <textarea
                    value={welcomeMessage}
                    onChange={(event) => setWelcomeMessage(event.target.value)}
                    placeholder="Complétez les étapes ci-dessous pour démarrer votre projet. Cela prend environ 10 minutes."
                    rows={3}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                  />
                </div>
                <BrandColorPicker value={brandColor} onChange={setBrandColor} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="email"
                    placeholder="Email de contact (optionnel)"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                  />
                  <Input
                    type="tel"
                    placeholder="Téléphone (optionnel)"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                  />
                </div>
                <PortalPreviewLink data={previewData} />
                <Button onClick={handleSaveAgency} disabled={agencySaving}>
                  {agencySaving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
                </Button>
                <SectionMessage feedback={agencyFeedback} />
              </div>
            </SettingsSection>

            <SettingsSection
              id="settings-relances"
              icon="📬"
              title="Relances automatiques"
              description="Configurez les emails de relance envoyés aux clients dont la checklist est incomplète."
            >
              <ReminderSettingsPanel
                agencyId={agency?.id ?? null}
                enabled={autoRemindersEnabled}
                delayHours={autoRemindersDelayHours}
                onEnabledChange={setAutoRemindersEnabled}
                onDelayChange={setAutoRemindersDelayHours}
                onSave={handleSaveReminders}
                saving={reminderSaving}
                feedback={reminderFeedback}
                aiEnabled={aiFlags.reminders}
                aiTone={aiReminderTone}
                aiAutoSend={aiReminderAutoSend}
                aiMaxPerProject={aiReminderMax}
                onAiToneChange={setAiReminderTone}
                onAiAutoSendChange={setAiReminderAutoSend}
                onAiMaxChange={setAiReminderMax}
              />
            </SettingsSection>

            <SettingsSection
              id="settings-ia"
              icon="✨"
              title="Intelligence artificielle"
              description="Activez les modules IA de Freli : extraction de documents, relances intelligentes et génération de contrats."
            >
              <AiModulesPanel
                agencyId={agency?.id ?? null}
                flags={aiFlags}
                onFlagsChange={setAiFlags}
                onSave={handleSaveAi}
                saving={aiSaving}
                feedback={aiFeedback}
              />
            </SettingsSection>

            <SettingsSection
              id="settings-compte"
              icon="👤"
              title="Mon compte"
              description="Identifiants de connexion à Freli."
            >
              <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--surface-warm)] px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-body text-sm font-semibold text-[var(--accent)]">
                  {accountInitials(accountEmail)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-body font-medium text-[var(--ink)]">{accountEmail}</p>
                  <p className="text-xs font-body text-[var(--ink-muted)]">Compte agence Freli</p>
                </div>
              </div>

              {!showPasswordForm ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(true)}
                  className="mt-4 text-sm font-body font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Modifier le mot de passe
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <Input
                    type="password"
                    placeholder="Nouveau mot de passe"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Confirmer le mot de passe"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleChangePassword} disabled={passwordSaving}>
                      {passwordSaving ? 'Mise à jour…' : 'Mettre à jour'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowPasswordForm(false)
                        setPassword('')
                        setPasswordConfirm('')
                        setPasswordFeedback(null)
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
              <SectionMessage feedback={passwordFeedback} />
            </SettingsSection>

            <SettingsSection
              id="settings-aide"
              icon="💬"
              title="Aide & accès"
              description="Support, abonnement et documents légaux."
            >
              <p className="text-sm font-body leading-relaxed text-[var(--ink-muted)]">
                Freli est une application sur invitation. Pour toute question sur votre abonnement ou
                votre accès, contactez le support.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={supportMailto}
                  className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Contacter le support ({SUPPORT_EMAIL})
                </a>
                <Link
                  to="/dashboard/integrations"
                  className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Intégrations
                </Link>
                <Link
                  to="/confidentialite"
                  className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Confidentialité
                </Link>
                <Link
                  to="/conditions-utilisation"
                  className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  Conditions d&apos;utilisation
                </Link>
              </div>
            </SettingsSection>

            <Card className="border border-[var(--border)]">
              <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Session</h2>
              <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
                Déconnexion sur cet appareil. La suppression de compte se fait sur demande au support.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[13px] font-body text-[var(--ink-soft)]">{accountEmail}</p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--ink-muted)]"
                >
                  Se déconnecter
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-body text-[var(--white)] shadow-lg md:bottom-8">
          {toast}
        </div>
      ) : null}
    </DashboardLayout>
  )
}
